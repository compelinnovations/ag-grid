import { CustomHeaderProps } from '@ag-grid-community/react';
import React, { useEffect, useRef, useState } from 'react';

export interface MyCustomHeaderProps extends CustomHeaderProps {
    menuIcon: string;
}

export default (props: MyCustomHeaderProps) => {
    const [ascSort, setAscSort] = useState('inactive');
    const [descSort, setDescSort] = useState('inactive');
    const [noSort, setNoSort] = useState('inactive');
    const refButton = useRef(null);
    const refLabel = useRef<HTMLDivElement>(null);

    const onMenuClicked = () => {
        props.showColumnMenu(refButton.current!);
    };

    const onSortChanged = () => {
        setAscSort(props.column.isSortAscending() ? 'active' : 'inactive');
        setDescSort(props.column.isSortDescending() ? 'active' : 'inactive');
        setNoSort(!props.column.isSortAscending() && !props.column.isSortDescending() ? 'active' : 'inactive');
    };

    const onSortRequested = (order: 'asc' | 'desc' | null, event: any) => {
        props.setSort(order, event.shiftKey);
    };

    useEffect(() => {
        props.column.addEventListener('sortChanged', onSortChanged);
        onSortChanged();
    }, []);

    useEffect(() => {
        if (!refLabel.current) {
            return;
        }
        props.setTooltip(props.displayName, () => refLabel.current!.scrollWidth > refLabel.current!.clientWidth);
    }, [refLabel]);

    let menu = null;
    if (props.enableMenu) {
        menu = (
            <div ref={refButton} className="customHeaderMenuButton" onClick={() => onMenuClicked()}>
                <i className={`fa ${props.menuIcon}`}></i>
            </div>
        );
    }

    let sort = null;
    if (props.enableSorting) {
        sort = (
            <React.Fragment>
                <div
                    onClick={(event) => onSortRequested('asc', event)}
                    onTouchEnd={(event) => onSortRequested('asc', event)}
                    className={`customSortDownLabel ${ascSort}`}
                >
                    <i className="fa fa-long-arrow-alt-down"></i>
                </div>
                <div
                    onClick={(event) => onSortRequested('desc', event)}
                    onTouchEnd={(event) => onSortRequested('desc', event)}
                    className={`customSortUpLabel ${descSort}`}
                >
                    <i className="fa fa-long-arrow-alt-up"></i>
                </div>
                <div
                    onClick={(event) => onSortRequested(null, event)}
                    onTouchEnd={(event) => onSortRequested(null, event)}
                    className={`customSortRemoveLabel ${noSort}`}
                >
                    <i className="fa fa-times"></i>
                </div>
            </React.Fragment>
        );
    }

    return (
        <div className="headerWrapper">
            {menu}
            <div ref={refLabel} className="customHeaderLabel">
                {props.displayName}
            </div>
            {sort}
        </div>
    );
};
