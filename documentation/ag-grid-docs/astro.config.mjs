import markdoc from '@astrojs/markdoc';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import dotenvExpand from 'dotenv-expand';
import * as sass from 'sass';
import { loadEnv } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import svgr from 'vite-plugin-svgr';

import agHotModuleReload from './plugins/agHotModuleReload';
import agHtaccessGen from './plugins/agHtaccessGen';
import agLinkChecker from './plugins/agLinkChecker';
import agRedirectsChecker from './plugins/agRedirectsChecker';
import { getSitemapConfig } from './src/utils/sitemap';
import { urlWithBaseUrl } from './src/utils/urlWithBaseUrl';

const { NODE_ENV } = process.env;
const DEFAULT_BASE_URL = '/';
const dotenv = {
    parsed: loadEnv(NODE_ENV, process.cwd(), ''),
};

/**
 * Environment variables used to modify the configuration of the server/build
 */
const {
    /**
     * Port used for servers
     */
    PORT,

    /**
     * Site url
     *
     * eg, `https://grid-staging.ag-grid.com`
     */
    PUBLIC_SITE_URL,

    /**
     * Base url used as a prefix to all urls
     *
     * eg, `/something` for site at `https://grid-staging.ag-grid.com/something`
     */
    PUBLIC_BASE_URL = DEFAULT_BASE_URL,

    /**
     * Use published packages in examples
     */
    PUBLIC_USE_PUBLISHED_PACKAGES,

    /**
     * Use packages for code
     */
    USE_PACKAGES,

    /**
     * Set up https server
     */
    PUBLIC_HTTPS_SERVER = '1',

    /**
     * Generate `/debug/*` pages
     */
    ENABLE_GENERATE_DEBUG_PAGES = '1',

    /**
     * Show debug logs in the terminal
     *
     * Used to hide logs that are annoying for most other devs
     */
    SHOW_DEBUG_LOGS,

    /**
     * Generate a `.htaccess` file for deployment
     *
     * Generated in `dist/.htaccess`
     */
    HTACCESS = 'false',

    /**
     * Check all redirects have a valid page generated by the build
     *
     * Checks the `to` paths in `src/utils/htaccess/redirects.ts`
     */
    CHECK_REDIRECTS = 'false',

    /**
     * Check all links have valid destinations generated by the build
     */
    CHECK_LINKS = 'false',

    /*
     * Select pages to build
     *
     * A comma separated list of pages to build to make it run faster
     */
    QUICK_BUILD_PAGES,
} = dotenvExpand.expand(dotenv).parsed;
console.log(
    'Astro configuration',
    JSON.stringify(
        {
            NODE_ENV,
            PORT,
            PUBLIC_SITE_URL,
            PUBLIC_BASE_URL,
            PUBLIC_USE_PUBLISHED_PACKAGES,
            USE_PACKAGES,
            ENABLE_GENERATE_DEBUG_PAGES,
            SHOW_DEBUG_LOGS,
            HTACCESS,
            CHECK_REDIRECTS,
            QUICK_BUILD_PAGES,
        },
        null,
        2
    )
);

// https://astro.build/config
export default defineConfig({
    site: PUBLIC_SITE_URL,
    base: PUBLIC_BASE_URL,
    devToolbar: {
        enabled: false,
    },
    vite: {
        plugins: [mkcert(), svgr(), agHotModuleReload()],
        server: {
            https: !['0', 'false'].includes(PUBLIC_HTTPS_SERVER),
        },
        css: {
            preprocessorOptions: {
                scss: {
                    functions: {
                        'urlWithBaseUrl($url)': function (url) {
                            const urlWithBase = urlWithBaseUrl(url.getValue(), PUBLIC_BASE_URL);

                            return new sass.types.String(urlWithBase);
                        },
                    },
                    includePaths: ['../../external/ag-website-shared/src'],
                },
            },
        },
        optimizeDeps: {
            // Prevent vite from importing in content/docs folder
            exclude: ['vue', '@angular/common/http', '@angular/forms', '@angular/common', '@angular/platform-browser'],
        },
    },
    integrations: [
        react(),
        markdoc(),
        sitemap(getSitemapConfig()),
        agHtaccessGen({ include: HTACCESS === 'true' }),
        agRedirectsChecker({
            skip: CHECK_REDIRECTS !== 'true',
        }),
        agLinkChecker({ include: CHECK_LINKS === 'true' }),
    ],
});
