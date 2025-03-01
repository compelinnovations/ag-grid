import fs from 'fs';

import { API_REFERENCE_DIR, API_SOURCE_DIR } from '../utils/constants';

export interface APIPageData {
    pagePath: `/${string}/`;
    propertiesFileUrl: string;
    breadcrumbSuffix: string;
}

/**
 * Finds all the API pages to be indexed
 */
export const getApiPageData = (): APIPageData[] => {
    const result = [];

    const pageNames = fs.readdirSync(API_SOURCE_DIR, { withFileTypes: true });
    pageNames.forEach((page) => {
        if (page.isDirectory()) {
            const pagePath = `${API_SOURCE_DIR}/${page.name}`;
            const files = fs.readdirSync(pagePath);
            const configFiles = files.filter((file) => file.endsWith('.json'));

            configFiles.forEach((file) => {
                const pageName = page.name
                    .split('-')
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                const config: APIPageData = {
                    pagePath: `/${page.name}/`,
                    propertiesFileUrl: `${pagePath}/${file}`,
                    breadcrumbSuffix: pageName,
                };
                result.push(config);
            });
        }
    });

    return result;
};

/**
 * Parse the API files to retrieve the index data
 */
export const parseApiPageData = (details: APIPageData): AlgoliaRecord[] => {
    const records: AlgoliaRecord = [];

    const { propertiesFileUrl, breadcrumbSuffix, pagePath } = details;

    const file = fs.readFileSync(propertiesFileUrl, null);
    const { _config_, ...sections } = JSON.parse(file);
    if (!_config_) return []; // if no config, wrong type of file.
    const { codeSrc } = _config_;
    if (!codeSrc) return []; // if no src, wrong type of file.

    const referenceFile = fs.readFileSync(`${API_REFERENCE_DIR}/${codeSrc}`, null);
    const apiPropertiesSourceFile = JSON.parse(referenceFile);

    let position = 0;
    // load the defined sections for the API docs
    Object.entries(sections).forEach(([sectionKey, section]) => {
        const { meta, ...properties } = section;
        const sectionDisplayName = meta?.displayName ?? sectionKey; // Formatted section name

        Object.entries(properties).forEach(([propertyKey, property]) => {
            const { description, more } = property; // more can include a link to a page with more info

            const data = apiPropertiesSourceFile[propertyKey];

            const breadcrumb = `API > ${breadcrumbSuffix}`;
            const path = `${pagePath}#reference-${sectionKey}-${propertyKey}`;
            const text = description ?? data.meta.comment;
            const normalizedText = text.replace(/\[([^\]]+)\][^\)]+\)/g, '$1');

            records.push({
                source: 'api',

                objectID: path,
                title: breadcrumbSuffix,
                heading: propertyKey,
                text: normalizedText,
                breadcrumb: breadcrumb,
                path: path,
                rank: position++,
            });
        });
    });

    return records;
};
