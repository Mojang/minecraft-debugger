export function removeAllStyleElements(root: HTMLElement | SVGSVGElement) {
    // Remove all style elements
    const allStyleElements = root.querySelectorAll('style');

    for (const styleElement of allStyleElements) {
        styleElement.parentNode?.removeChild(styleElement);
    }

    // Remove style attribute
    const styleAttribute = root.getAttributeNode('style');
    if (styleAttribute !== null) {
        root.removeAttributeNode(styleAttribute);
    }
}
