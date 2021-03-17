/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * True if the custom elements polyfill is in use.
 */
const isCEPolyfill = typeof window !== 'undefined' &&
    window.customElements != null &&
    window.customElements.polyfillWrapFlushCallback !==
        undefined;
/**
 * Removes nodes, starting from `start` (inclusive) to `end` (exclusive), from
 * `container`.
 */
const removeNodes = (container, start, end = null) => {
    while (start !== end) {
        const n = start.nextSibling;
        container.removeChild(start);
        start = n;
    }
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * An expression marker with embedded unique key to avoid collision with
 * possible text in templates.
 */
const marker = `{{lit-${String(Math.random()).slice(2)}}}`;
/**
 * An expression marker used text-positions, multi-binding attributes, and
 * attributes with markup-like text values.
 */
const nodeMarker = `<!--${marker}-->`;
const markerRegex = new RegExp(`${marker}|${nodeMarker}`);
/**
 * Suffix appended to all bound attribute names.
 */
const boundAttributeSuffix = '$lit$';
/**
 * An updatable Template that tracks the location of dynamic parts.
 */
class Template {
    constructor(result, element) {
        this.parts = [];
        this.element = element;
        const nodesToRemove = [];
        const stack = [];
        // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
        const walker = document.createTreeWalker(element.content, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
        // Keeps track of the last index associated with a part. We try to delete
        // unnecessary nodes, but we never want to associate two different parts
        // to the same index. They must have a constant node between.
        let lastPartIndex = 0;
        let index = -1;
        let partIndex = 0;
        const { strings, values: { length } } = result;
        while (partIndex < length) {
            const node = walker.nextNode();
            if (node === null) {
                // We've exhausted the content inside a nested template element.
                // Because we still have parts (the outer for-loop), we know:
                // - There is a template in the stack
                // - The walker will find a nextNode outside the template
                walker.currentNode = stack.pop();
                continue;
            }
            index++;
            if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
                if (node.hasAttributes()) {
                    const attributes = node.attributes;
                    const { length } = attributes;
                    // Per
                    // https://developer.mozilla.org/en-US/docs/Web/API/NamedNodeMap,
                    // attributes are not guaranteed to be returned in document order.
                    // In particular, Edge/IE can return them out of order, so we cannot
                    // assume a correspondence between part index and attribute index.
                    let count = 0;
                    for (let i = 0; i < length; i++) {
                        if (endsWith(attributes[i].name, boundAttributeSuffix)) {
                            count++;
                        }
                    }
                    while (count-- > 0) {
                        // Get the template literal section leading up to the first
                        // expression in this attribute
                        const stringForPart = strings[partIndex];
                        // Find the attribute name
                        const name = lastAttributeNameRegex.exec(stringForPart)[2];
                        // Find the corresponding attribute
                        // All bound attributes have had a suffix added in
                        // TemplateResult#getHTML to opt out of special attribute
                        // handling. To look up the attribute value we also need to add
                        // the suffix.
                        const attributeLookupName = name.toLowerCase() + boundAttributeSuffix;
                        const attributeValue = node.getAttribute(attributeLookupName);
                        node.removeAttribute(attributeLookupName);
                        const statics = attributeValue.split(markerRegex);
                        this.parts.push({ type: 'attribute', index, name, strings: statics });
                        partIndex += statics.length - 1;
                    }
                }
                if (node.tagName === 'TEMPLATE') {
                    stack.push(node);
                    walker.currentNode = node.content;
                }
            }
            else if (node.nodeType === 3 /* Node.TEXT_NODE */) {
                const data = node.data;
                if (data.indexOf(marker) >= 0) {
                    const parent = node.parentNode;
                    const strings = data.split(markerRegex);
                    const lastIndex = strings.length - 1;
                    // Generate a new text node for each literal section
                    // These nodes are also used as the markers for node parts
                    for (let i = 0; i < lastIndex; i++) {
                        let insert;
                        let s = strings[i];
                        if (s === '') {
                            insert = createMarker();
                        }
                        else {
                            const match = lastAttributeNameRegex.exec(s);
                            if (match !== null && endsWith(match[2], boundAttributeSuffix)) {
                                s = s.slice(0, match.index) + match[1] +
                                    match[2].slice(0, -boundAttributeSuffix.length) + match[3];
                            }
                            insert = document.createTextNode(s);
                        }
                        parent.insertBefore(insert, node);
                        this.parts.push({ type: 'node', index: ++index });
                    }
                    // If there's no text, we must insert a comment to mark our place.
                    // Else, we can trust it will stick around after cloning.
                    if (strings[lastIndex] === '') {
                        parent.insertBefore(createMarker(), node);
                        nodesToRemove.push(node);
                    }
                    else {
                        node.data = strings[lastIndex];
                    }
                    // We have a part for each match found
                    partIndex += lastIndex;
                }
            }
            else if (node.nodeType === 8 /* Node.COMMENT_NODE */) {
                if (node.data === marker) {
                    const parent = node.parentNode;
                    // Add a new marker node to be the startNode of the Part if any of
                    // the following are true:
                    //  * We don't have a previousSibling
                    //  * The previousSibling is already the start of a previous part
                    if (node.previousSibling === null || index === lastPartIndex) {
                        index++;
                        parent.insertBefore(createMarker(), node);
                    }
                    lastPartIndex = index;
                    this.parts.push({ type: 'node', index });
                    // If we don't have a nextSibling, keep this node so we have an end.
                    // Else, we can remove it to save future costs.
                    if (node.nextSibling === null) {
                        node.data = '';
                    }
                    else {
                        nodesToRemove.push(node);
                        index--;
                    }
                    partIndex++;
                }
                else {
                    let i = -1;
                    while ((i = node.data.indexOf(marker, i + 1)) !== -1) {
                        // Comment node has a binding marker inside, make an inactive part
                        // The binding won't work, but subsequent bindings will
                        // TODO (justinfagnani): consider whether it's even worth it to
                        // make bindings in comments work
                        this.parts.push({ type: 'node', index: -1 });
                        partIndex++;
                    }
                }
            }
        }
        // Remove text binding nodes after the walk to not disturb the TreeWalker
        for (const n of nodesToRemove) {
            n.parentNode.removeChild(n);
        }
    }
}
const endsWith = (str, suffix) => {
    const index = str.length - suffix.length;
    return index >= 0 && str.slice(index) === suffix;
};
const isTemplatePartActive = (part) => part.index !== -1;
// Allows `document.createComment('')` to be renamed for a
// small manual size-savings.
const createMarker = () => document.createComment('');
/**
 * This regex extracts the attribute name preceding an attribute-position
 * expression. It does this by matching the syntax allowed for attributes
 * against the string literal directly preceding the expression, assuming that
 * the expression is in an attribute-value position.
 *
 * See attributes in the HTML spec:
 * https://www.w3.org/TR/html5/syntax.html#elements-attributes
 *
 * " \x09\x0a\x0c\x0d" are HTML space characters:
 * https://www.w3.org/TR/html5/infrastructure.html#space-characters
 *
 * "\0-\x1F\x7F-\x9F" are Unicode control characters, which includes every
 * space character except " ".
 *
 * So an attribute is:
 *  * The name: any character except a control character, space character, ('),
 *    ("), ">", "=", or "/"
 *  * Followed by zero or more space characters
 *  * Followed by "="
 *  * Followed by zero or more space characters
 *  * Followed by:
 *    * Any character except space, ('), ("), "<", ">", "=", (`), or
 *    * (") then any non-("), or
 *    * (') then any non-(')
 */
const lastAttributeNameRegex = 
// eslint-disable-next-line no-control-regex
/([ \x09\x0a\x0c\x0d])([^\0-\x1F\x7F-\x9F "'>=/]+)([ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*))$/;

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const walkerNodeFilter = 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */;
/**
 * Removes the list of nodes from a Template safely. In addition to removing
 * nodes from the Template, the Template part indices are updated to match
 * the mutated Template DOM.
 *
 * As the template is walked the removal state is tracked and
 * part indices are adjusted as needed.
 *
 * div
 *   div#1 (remove) <-- start removing (removing node is div#1)
 *     div
 *       div#2 (remove)  <-- continue removing (removing node is still div#1)
 *         div
 * div <-- stop removing since previous sibling is the removing node (div#1,
 * removed 4 nodes)
 */
function removeNodesFromTemplate(template, nodesToRemove) {
    const { element: { content }, parts } = template;
    const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
    let partIndex = nextActiveIndexInTemplateParts(parts);
    let part = parts[partIndex];
    let nodeIndex = -1;
    let removeCount = 0;
    const nodesToRemoveInTemplate = [];
    let currentRemovingNode = null;
    while (walker.nextNode()) {
        nodeIndex++;
        const node = walker.currentNode;
        // End removal if stepped past the removing node
        if (node.previousSibling === currentRemovingNode) {
            currentRemovingNode = null;
        }
        // A node to remove was found in the template
        if (nodesToRemove.has(node)) {
            nodesToRemoveInTemplate.push(node);
            // Track node we're removing
            if (currentRemovingNode === null) {
                currentRemovingNode = node;
            }
        }
        // When removing, increment count by which to adjust subsequent part indices
        if (currentRemovingNode !== null) {
            removeCount++;
        }
        while (part !== undefined && part.index === nodeIndex) {
            // If part is in a removed node deactivate it by setting index to -1 or
            // adjust the index as needed.
            part.index = currentRemovingNode !== null ? -1 : part.index - removeCount;
            // go to the next active part.
            partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
            part = parts[partIndex];
        }
    }
    nodesToRemoveInTemplate.forEach((n) => n.parentNode.removeChild(n));
}
const countNodes = (node) => {
    let count = (node.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) ? 0 : 1;
    const walker = document.createTreeWalker(node, walkerNodeFilter, null, false);
    while (walker.nextNode()) {
        count++;
    }
    return count;
};
const nextActiveIndexInTemplateParts = (parts, startIndex = -1) => {
    for (let i = startIndex + 1; i < parts.length; i++) {
        const part = parts[i];
        if (isTemplatePartActive(part)) {
            return i;
        }
    }
    return -1;
};
/**
 * Inserts the given node into the Template, optionally before the given
 * refNode. In addition to inserting the node into the Template, the Template
 * part indices are updated to match the mutated Template DOM.
 */
function insertNodeIntoTemplate(template, node, refNode = null) {
    const { element: { content }, parts } = template;
    // If there's no refNode, then put node at end of template.
    // No part indices need to be shifted in this case.
    if (refNode === null || refNode === undefined) {
        content.appendChild(node);
        return;
    }
    const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
    let partIndex = nextActiveIndexInTemplateParts(parts);
    let insertCount = 0;
    let walkerIndex = -1;
    while (walker.nextNode()) {
        walkerIndex++;
        const walkerNode = walker.currentNode;
        if (walkerNode === refNode) {
            insertCount = countNodes(node);
            refNode.parentNode.insertBefore(node, refNode);
        }
        while (partIndex !== -1 && parts[partIndex].index === walkerIndex) {
            // If we've inserted the node, simply adjust all subsequent parts
            if (insertCount > 0) {
                while (partIndex !== -1) {
                    parts[partIndex].index += insertCount;
                    partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
                }
                return;
            }
            partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
        }
    }
}

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const directives = new WeakMap();
/**
 * Brands a function as a directive factory function so that lit-html will call
 * the function during template rendering, rather than passing as a value.
 *
 * A _directive_ is a function that takes a Part as an argument. It has the
 * signature: `(part: Part) => void`.
 *
 * A directive _factory_ is a function that takes arguments for data and
 * configuration and returns a directive. Users of directive usually refer to
 * the directive factory as the directive. For example, "The repeat directive".
 *
 * Usually a template author will invoke a directive factory in their template
 * with relevant arguments, which will then return a directive function.
 *
 * Here's an example of using the `repeat()` directive factory that takes an
 * array and a function to render an item:
 *
 * ```js
 * html`<ul><${repeat(items, (item) => html`<li>${item}</li>`)}</ul>`
 * ```
 *
 * When `repeat` is invoked, it returns a directive function that closes over
 * `items` and the template function. When the outer template is rendered, the
 * return directive function is called with the Part for the expression.
 * `repeat` then performs it's custom logic to render multiple items.
 *
 * @param f The directive factory function. Must be a function that returns a
 * function of the signature `(part: Part) => void`. The returned function will
 * be called with the part object.
 *
 * @example
 *
 * import {directive, html} from 'lit-html';
 *
 * const immutable = directive((v) => (part) => {
 *   if (part.value !== v) {
 *     part.setValue(v)
 *   }
 * });
 */
const directive = (f) => ((...args) => {
    const d = f(...args);
    directives.set(d, true);
    return d;
});
const isDirective = (o) => {
    return typeof o === 'function' && directives.has(o);
};

/**
 * @license
 * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * A sentinel value that signals that a value was handled by a directive and
 * should not be written to the DOM.
 */
const noChange = {};
/**
 * A sentinel value that signals a NodePart to fully clear its content.
 */
const nothing = {};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * An instance of a `Template` that can be attached to the DOM and updated
 * with new values.
 */
class TemplateInstance {
    constructor(template, processor, options) {
        this.__parts = [];
        this.template = template;
        this.processor = processor;
        this.options = options;
    }
    update(values) {
        let i = 0;
        for (const part of this.__parts) {
            if (part !== undefined) {
                part.setValue(values[i]);
            }
            i++;
        }
        for (const part of this.__parts) {
            if (part !== undefined) {
                part.commit();
            }
        }
    }
    _clone() {
        // There are a number of steps in the lifecycle of a template instance's
        // DOM fragment:
        //  1. Clone - create the instance fragment
        //  2. Adopt - adopt into the main document
        //  3. Process - find part markers and create parts
        //  4. Upgrade - upgrade custom elements
        //  5. Update - set node, attribute, property, etc., values
        //  6. Connect - connect to the document. Optional and outside of this
        //     method.
        //
        // We have a few constraints on the ordering of these steps:
        //  * We need to upgrade before updating, so that property values will pass
        //    through any property setters.
        //  * We would like to process before upgrading so that we're sure that the
        //    cloned fragment is inert and not disturbed by self-modifying DOM.
        //  * We want custom elements to upgrade even in disconnected fragments.
        //
        // Given these constraints, with full custom elements support we would
        // prefer the order: Clone, Process, Adopt, Upgrade, Update, Connect
        //
        // But Safari does not implement CustomElementRegistry#upgrade, so we
        // can not implement that order and still have upgrade-before-update and
        // upgrade disconnected fragments. So we instead sacrifice the
        // process-before-upgrade constraint, since in Custom Elements v1 elements
        // must not modify their light DOM in the constructor. We still have issues
        // when co-existing with CEv0 elements like Polymer 1, and with polyfills
        // that don't strictly adhere to the no-modification rule because shadow
        // DOM, which may be created in the constructor, is emulated by being placed
        // in the light DOM.
        //
        // The resulting order is on native is: Clone, Adopt, Upgrade, Process,
        // Update, Connect. document.importNode() performs Clone, Adopt, and Upgrade
        // in one step.
        //
        // The Custom Elements v1 polyfill supports upgrade(), so the order when
        // polyfilled is the more ideal: Clone, Process, Adopt, Upgrade, Update,
        // Connect.
        const fragment = isCEPolyfill ?
            this.template.element.content.cloneNode(true) :
            document.importNode(this.template.element.content, true);
        const stack = [];
        const parts = this.template.parts;
        // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
        const walker = document.createTreeWalker(fragment, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
        let partIndex = 0;
        let nodeIndex = 0;
        let part;
        let node = walker.nextNode();
        // Loop through all the nodes and parts of a template
        while (partIndex < parts.length) {
            part = parts[partIndex];
            if (!isTemplatePartActive(part)) {
                this.__parts.push(undefined);
                partIndex++;
                continue;
            }
            // Progress the tree walker until we find our next part's node.
            // Note that multiple parts may share the same node (attribute parts
            // on a single element), so this loop may not run at all.
            while (nodeIndex < part.index) {
                nodeIndex++;
                if (node.nodeName === 'TEMPLATE') {
                    stack.push(node);
                    walker.currentNode = node.content;
                }
                if ((node = walker.nextNode()) === null) {
                    // We've exhausted the content inside a nested template element.
                    // Because we still have parts (the outer for-loop), we know:
                    // - There is a template in the stack
                    // - The walker will find a nextNode outside the template
                    walker.currentNode = stack.pop();
                    node = walker.nextNode();
                }
            }
            // We've arrived at our part's node.
            if (part.type === 'node') {
                const part = this.processor.handleTextExpression(this.options);
                part.insertAfterNode(node.previousSibling);
                this.__parts.push(part);
            }
            else {
                this.__parts.push(...this.processor.handleAttributeExpressions(node, part.name, part.strings, this.options));
            }
            partIndex++;
        }
        if (isCEPolyfill) {
            document.adoptNode(fragment);
            customElements.upgrade(fragment);
        }
        return fragment;
    }
}

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * Our TrustedTypePolicy for HTML which is declared using the html template
 * tag function.
 *
 * That HTML is a developer-authored constant, and is parsed with innerHTML
 * before any untrusted expressions have been mixed in. Therefor it is
 * considered safe by construction.
 */
const policy = window.trustedTypes &&
    trustedTypes.createPolicy('lit-html', { createHTML: (s) => s });
const commentMarker = ` ${marker} `;
/**
 * The return type of `html`, which holds a Template and the values from
 * interpolated expressions.
 */
class TemplateResult {
    constructor(strings, values, type, processor) {
        this.strings = strings;
        this.values = values;
        this.type = type;
        this.processor = processor;
    }
    /**
     * Returns a string of HTML used to create a `<template>` element.
     */
    getHTML() {
        const l = this.strings.length - 1;
        let html = '';
        let isCommentBinding = false;
        for (let i = 0; i < l; i++) {
            const s = this.strings[i];
            // For each binding we want to determine the kind of marker to insert
            // into the template source before it's parsed by the browser's HTML
            // parser. The marker type is based on whether the expression is in an
            // attribute, text, or comment position.
            //   * For node-position bindings we insert a comment with the marker
            //     sentinel as its text content, like <!--{{lit-guid}}-->.
            //   * For attribute bindings we insert just the marker sentinel for the
            //     first binding, so that we support unquoted attribute bindings.
            //     Subsequent bindings can use a comment marker because multi-binding
            //     attributes must be quoted.
            //   * For comment bindings we insert just the marker sentinel so we don't
            //     close the comment.
            //
            // The following code scans the template source, but is *not* an HTML
            // parser. We don't need to track the tree structure of the HTML, only
            // whether a binding is inside a comment, and if not, if it appears to be
            // the first binding in an attribute.
            const commentOpen = s.lastIndexOf('<!--');
            // We're in comment position if we have a comment open with no following
            // comment close. Because <-- can appear in an attribute value there can
            // be false positives.
            isCommentBinding = (commentOpen > -1 || isCommentBinding) &&
                s.indexOf('-->', commentOpen + 1) === -1;
            // Check to see if we have an attribute-like sequence preceding the
            // expression. This can match "name=value" like structures in text,
            // comments, and attribute values, so there can be false-positives.
            const attributeMatch = lastAttributeNameRegex.exec(s);
            if (attributeMatch === null) {
                // We're only in this branch if we don't have a attribute-like
                // preceding sequence. For comments, this guards against unusual
                // attribute values like <div foo="<!--${'bar'}">. Cases like
                // <!-- foo=${'bar'}--> are handled correctly in the attribute branch
                // below.
                html += s + (isCommentBinding ? commentMarker : nodeMarker);
            }
            else {
                // For attributes we use just a marker sentinel, and also append a
                // $lit$ suffix to the name to opt-out of attribute-specific parsing
                // that IE and Edge do for style and certain SVG attributes.
                html += s.substr(0, attributeMatch.index) + attributeMatch[1] +
                    attributeMatch[2] + boundAttributeSuffix + attributeMatch[3] +
                    marker;
            }
        }
        html += this.strings[l];
        return html;
    }
    getTemplateElement() {
        const template = document.createElement('template');
        let value = this.getHTML();
        if (policy !== undefined) {
            // this is secure because `this.strings` is a TemplateStringsArray.
            // TODO: validate this when
            // https://github.com/tc39/proposal-array-is-template-object is
            // implemented.
            value = policy.createHTML(value);
        }
        template.innerHTML = value;
        return template;
    }
}

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const isPrimitive = (value) => {
    return (value === null ||
        !(typeof value === 'object' || typeof value === 'function'));
};
const isIterable = (value) => {
    return Array.isArray(value) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !!(value && value[Symbol.iterator]);
};
/**
 * Writes attribute values to the DOM for a group of AttributeParts bound to a
 * single attribute. The value is only set once even if there are multiple parts
 * for an attribute.
 */
class AttributeCommitter {
    constructor(element, name, strings) {
        this.dirty = true;
        this.element = element;
        this.name = name;
        this.strings = strings;
        this.parts = [];
        for (let i = 0; i < strings.length - 1; i++) {
            this.parts[i] = this._createPart();
        }
    }
    /**
     * Creates a single part. Override this to create a differnt type of part.
     */
    _createPart() {
        return new AttributePart(this);
    }
    _getValue() {
        const strings = this.strings;
        const l = strings.length - 1;
        const parts = this.parts;
        // If we're assigning an attribute via syntax like:
        //    attr="${foo}"  or  attr=${foo}
        // but not
        //    attr="${foo} ${bar}" or attr="${foo} baz"
        // then we don't want to coerce the attribute value into one long
        // string. Instead we want to just return the value itself directly,
        // so that sanitizeDOMValue can get the actual value rather than
        // String(value)
        // The exception is if v is an array, in which case we do want to smash
        // it together into a string without calling String() on the array.
        //
        // This also allows trusted values (when using TrustedTypes) being
        // assigned to DOM sinks without being stringified in the process.
        if (l === 1 && strings[0] === '' && strings[1] === '') {
            const v = parts[0].value;
            if (typeof v === 'symbol') {
                return String(v);
            }
            if (typeof v === 'string' || !isIterable(v)) {
                return v;
            }
        }
        let text = '';
        for (let i = 0; i < l; i++) {
            text += strings[i];
            const part = parts[i];
            if (part !== undefined) {
                const v = part.value;
                if (isPrimitive(v) || !isIterable(v)) {
                    text += typeof v === 'string' ? v : String(v);
                }
                else {
                    for (const t of v) {
                        text += typeof t === 'string' ? t : String(t);
                    }
                }
            }
        }
        text += strings[l];
        return text;
    }
    commit() {
        if (this.dirty) {
            this.dirty = false;
            this.element.setAttribute(this.name, this._getValue());
        }
    }
}
/**
 * A Part that controls all or part of an attribute value.
 */
class AttributePart {
    constructor(committer) {
        this.value = undefined;
        this.committer = committer;
    }
    setValue(value) {
        if (value !== noChange && (!isPrimitive(value) || value !== this.value)) {
            this.value = value;
            // If the value is a not a directive, dirty the committer so that it'll
            // call setAttribute. If the value is a directive, it'll dirty the
            // committer if it calls setValue().
            if (!isDirective(value)) {
                this.committer.dirty = true;
            }
        }
    }
    commit() {
        while (isDirective(this.value)) {
            const directive = this.value;
            this.value = noChange;
            directive(this);
        }
        if (this.value === noChange) {
            return;
        }
        this.committer.commit();
    }
}
/**
 * A Part that controls a location within a Node tree. Like a Range, NodePart
 * has start and end locations and can set and update the Nodes between those
 * locations.
 *
 * NodeParts support several value types: primitives, Nodes, TemplateResults,
 * as well as arrays and iterables of those types.
 */
class NodePart {
    constructor(options) {
        this.value = undefined;
        this.__pendingValue = undefined;
        this.options = options;
    }
    /**
     * Appends this part into a container.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    appendInto(container) {
        this.startNode = container.appendChild(createMarker());
        this.endNode = container.appendChild(createMarker());
    }
    /**
     * Inserts this part after the `ref` node (between `ref` and `ref`'s next
     * sibling). Both `ref` and its next sibling must be static, unchanging nodes
     * such as those that appear in a literal section of a template.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    insertAfterNode(ref) {
        this.startNode = ref;
        this.endNode = ref.nextSibling;
    }
    /**
     * Appends this part into a parent part.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    appendIntoPart(part) {
        part.__insert(this.startNode = createMarker());
        part.__insert(this.endNode = createMarker());
    }
    /**
     * Inserts this part after the `ref` part.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    insertAfterPart(ref) {
        ref.__insert(this.startNode = createMarker());
        this.endNode = ref.endNode;
        ref.endNode = this.startNode;
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        if (this.startNode.parentNode === null) {
            return;
        }
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        const value = this.__pendingValue;
        if (value === noChange) {
            return;
        }
        if (isPrimitive(value)) {
            if (value !== this.value) {
                this.__commitText(value);
            }
        }
        else if (value instanceof TemplateResult) {
            this.__commitTemplateResult(value);
        }
        else if (value instanceof Node) {
            this.__commitNode(value);
        }
        else if (isIterable(value)) {
            this.__commitIterable(value);
        }
        else if (value === nothing) {
            this.value = nothing;
            this.clear();
        }
        else {
            // Fallback, will render the string representation
            this.__commitText(value);
        }
    }
    __insert(node) {
        this.endNode.parentNode.insertBefore(node, this.endNode);
    }
    __commitNode(value) {
        if (this.value === value) {
            return;
        }
        this.clear();
        this.__insert(value);
        this.value = value;
    }
    __commitText(value) {
        const node = this.startNode.nextSibling;
        value = value == null ? '' : value;
        // If `value` isn't already a string, we explicitly convert it here in case
        // it can't be implicitly converted - i.e. it's a symbol.
        const valueAsString = typeof value === 'string' ? value : String(value);
        if (node === this.endNode.previousSibling &&
            node.nodeType === 3 /* Node.TEXT_NODE */) {
            // If we only have a single text node between the markers, we can just
            // set its value, rather than replacing it.
            // TODO(justinfagnani): Can we just check if this.value is primitive?
            node.data = valueAsString;
        }
        else {
            this.__commitNode(document.createTextNode(valueAsString));
        }
        this.value = value;
    }
    __commitTemplateResult(value) {
        const template = this.options.templateFactory(value);
        if (this.value instanceof TemplateInstance &&
            this.value.template === template) {
            this.value.update(value.values);
        }
        else {
            // Make sure we propagate the template processor from the TemplateResult
            // so that we use its syntax extension, etc. The template factory comes
            // from the render function options so that it can control template
            // caching and preprocessing.
            const instance = new TemplateInstance(template, value.processor, this.options);
            const fragment = instance._clone();
            instance.update(value.values);
            this.__commitNode(fragment);
            this.value = instance;
        }
    }
    __commitIterable(value) {
        // For an Iterable, we create a new InstancePart per item, then set its
        // value to the item. This is a little bit of overhead for every item in
        // an Iterable, but it lets us recurse easily and efficiently update Arrays
        // of TemplateResults that will be commonly returned from expressions like:
        // array.map((i) => html`${i}`), by reusing existing TemplateInstances.
        // If _value is an array, then the previous render was of an
        // iterable and _value will contain the NodeParts from the previous
        // render. If _value is not an array, clear this part and make a new
        // array for NodeParts.
        if (!Array.isArray(this.value)) {
            this.value = [];
            this.clear();
        }
        // Lets us keep track of how many items we stamped so we can clear leftover
        // items from a previous render
        const itemParts = this.value;
        let partIndex = 0;
        let itemPart;
        for (const item of value) {
            // Try to reuse an existing part
            itemPart = itemParts[partIndex];
            // If no existing part, create a new one
            if (itemPart === undefined) {
                itemPart = new NodePart(this.options);
                itemParts.push(itemPart);
                if (partIndex === 0) {
                    itemPart.appendIntoPart(this);
                }
                else {
                    itemPart.insertAfterPart(itemParts[partIndex - 1]);
                }
            }
            itemPart.setValue(item);
            itemPart.commit();
            partIndex++;
        }
        if (partIndex < itemParts.length) {
            // Truncate the parts array so _value reflects the current state
            itemParts.length = partIndex;
            this.clear(itemPart && itemPart.endNode);
        }
    }
    clear(startNode = this.startNode) {
        removeNodes(this.startNode.parentNode, startNode.nextSibling, this.endNode);
    }
}
/**
 * Implements a boolean attribute, roughly as defined in the HTML
 * specification.
 *
 * If the value is truthy, then the attribute is present with a value of
 * ''. If the value is falsey, the attribute is removed.
 */
class BooleanAttributePart {
    constructor(element, name, strings) {
        this.value = undefined;
        this.__pendingValue = undefined;
        if (strings.length !== 2 || strings[0] !== '' || strings[1] !== '') {
            throw new Error('Boolean attributes can only contain a single expression');
        }
        this.element = element;
        this.name = name;
        this.strings = strings;
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        if (this.__pendingValue === noChange) {
            return;
        }
        const value = !!this.__pendingValue;
        if (this.value !== value) {
            if (value) {
                this.element.setAttribute(this.name, '');
            }
            else {
                this.element.removeAttribute(this.name);
            }
            this.value = value;
        }
        this.__pendingValue = noChange;
    }
}
/**
 * Sets attribute values for PropertyParts, so that the value is only set once
 * even if there are multiple parts for a property.
 *
 * If an expression controls the whole property value, then the value is simply
 * assigned to the property under control. If there are string literals or
 * multiple expressions, then the strings are expressions are interpolated into
 * a string first.
 */
class PropertyCommitter extends AttributeCommitter {
    constructor(element, name, strings) {
        super(element, name, strings);
        this.single =
            (strings.length === 2 && strings[0] === '' && strings[1] === '');
    }
    _createPart() {
        return new PropertyPart(this);
    }
    _getValue() {
        if (this.single) {
            return this.parts[0].value;
        }
        return super._getValue();
    }
    commit() {
        if (this.dirty) {
            this.dirty = false;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.element[this.name] = this._getValue();
        }
    }
}
class PropertyPart extends AttributePart {
}
// Detect event listener options support. If the `capture` property is read
// from the options object, then options are supported. If not, then the third
// argument to add/removeEventListener is interpreted as the boolean capture
// value so we should only pass the `capture` property.
let eventOptionsSupported = false;
// Wrap into an IIFE because MS Edge <= v41 does not support having try/catch
// blocks right into the body of a module
(() => {
    try {
        const options = {
            get capture() {
                eventOptionsSupported = true;
                return false;
            }
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.addEventListener('test', options, options);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.removeEventListener('test', options, options);
    }
    catch (_e) {
        // event options not supported
    }
})();
class EventPart {
    constructor(element, eventName, eventContext) {
        this.value = undefined;
        this.__pendingValue = undefined;
        this.element = element;
        this.eventName = eventName;
        this.eventContext = eventContext;
        this.__boundHandleEvent = (e) => this.handleEvent(e);
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        if (this.__pendingValue === noChange) {
            return;
        }
        const newListener = this.__pendingValue;
        const oldListener = this.value;
        const shouldRemoveListener = newListener == null ||
            oldListener != null &&
                (newListener.capture !== oldListener.capture ||
                    newListener.once !== oldListener.once ||
                    newListener.passive !== oldListener.passive);
        const shouldAddListener = newListener != null && (oldListener == null || shouldRemoveListener);
        if (shouldRemoveListener) {
            this.element.removeEventListener(this.eventName, this.__boundHandleEvent, this.__options);
        }
        if (shouldAddListener) {
            this.__options = getOptions(newListener);
            this.element.addEventListener(this.eventName, this.__boundHandleEvent, this.__options);
        }
        this.value = newListener;
        this.__pendingValue = noChange;
    }
    handleEvent(event) {
        if (typeof this.value === 'function') {
            this.value.call(this.eventContext || this.element, event);
        }
        else {
            this.value.handleEvent(event);
        }
    }
}
// We copy options because of the inconsistent behavior of browsers when reading
// the third argument of add/removeEventListener. IE11 doesn't support options
// at all. Chrome 41 only reads `capture` if the argument is an object.
const getOptions = (o) => o &&
    (eventOptionsSupported ?
        { capture: o.capture, passive: o.passive, once: o.once } :
        o.capture);

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * The default TemplateFactory which caches Templates keyed on
 * result.type and result.strings.
 */
function templateFactory(result) {
    let templateCache = templateCaches$1.get(result.type);
    if (templateCache === undefined) {
        templateCache = {
            stringsArray: new WeakMap(),
            keyString: new Map()
        };
        templateCaches$1.set(result.type, templateCache);
    }
    let template = templateCache.stringsArray.get(result.strings);
    if (template !== undefined) {
        return template;
    }
    // If the TemplateStringsArray is new, generate a key from the strings
    // This key is shared between all templates with identical content
    const key = result.strings.join(marker);
    // Check if we already have a Template for this key
    template = templateCache.keyString.get(key);
    if (template === undefined) {
        // If we have not seen this key before, create a new Template
        template = new Template(result, result.getTemplateElement());
        // Cache the Template for this key
        templateCache.keyString.set(key, template);
    }
    // Cache all future queries for this TemplateStringsArray
    templateCache.stringsArray.set(result.strings, template);
    return template;
}
const templateCaches$1 = new Map();

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const parts = new WeakMap();
/**
 * Renders a template result or other value to a container.
 *
 * To update a container with new values, reevaluate the template literal and
 * call `render` with the new result.
 *
 * @param result Any value renderable by NodePart - typically a TemplateResult
 *     created by evaluating a template tag like `html` or `svg`.
 * @param container A DOM parent to render to. The entire contents are either
 *     replaced, or efficiently updated if the same result type was previous
 *     rendered there.
 * @param options RenderOptions for the entire render tree rendered to this
 *     container. Render options must *not* change between renders to the same
 *     container, as those changes will not effect previously rendered DOM.
 */
const render$1 = (result, container, options) => {
    let part = parts.get(container);
    if (part === undefined) {
        removeNodes(container, container.firstChild);
        parts.set(container, part = new NodePart(Object.assign({ templateFactory }, options)));
        part.appendInto(container);
    }
    part.setValue(result);
    part.commit();
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * Creates Parts when a template is instantiated.
 */
class DefaultTemplateProcessor {
    /**
     * Create parts for an attribute-position binding, given the event, attribute
     * name, and string literals.
     *
     * @param element The element containing the binding
     * @param name  The attribute name
     * @param strings The string literals. There are always at least two strings,
     *   event for fully-controlled bindings with a single expression.
     */
    handleAttributeExpressions(element, name, strings, options) {
        const prefix = name[0];
        if (prefix === '.') {
            const committer = new PropertyCommitter(element, name.slice(1), strings);
            return committer.parts;
        }
        if (prefix === '@') {
            return [new EventPart(element, name.slice(1), options.eventContext)];
        }
        if (prefix === '?') {
            return [new BooleanAttributePart(element, name.slice(1), strings)];
        }
        const committer = new AttributeCommitter(element, name, strings);
        return committer.parts;
    }
    /**
     * Create parts for a text-position binding.
     * @param templateFactory
     */
    handleTextExpression(options) {
        return new NodePart(options);
    }
}
const defaultTemplateProcessor = new DefaultTemplateProcessor();

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// IMPORTANT: do not change the property name or the assignment expression.
// This line will be used in regexes to search for lit-html usage.
// TODO(justinfagnani): inject version number at build time
if (typeof window !== 'undefined') {
    (window['litHtmlVersions'] || (window['litHtmlVersions'] = [])).push('1.3.0');
}
/**
 * Interprets a template literal as an HTML template that can efficiently
 * render to and update a container.
 */
const html = (strings, ...values) => new TemplateResult(strings, values, 'html', defaultTemplateProcessor);

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// Get a key to lookup in `templateCaches`.
const getTemplateCacheKey$1 = (type, scopeName) => `${type}--${scopeName}`;
let compatibleShadyCSSVersion$1 = true;
if (typeof window.ShadyCSS === 'undefined') {
    compatibleShadyCSSVersion$1 = false;
}
else if (typeof window.ShadyCSS.prepareTemplateDom === 'undefined') {
    console.warn(`Incompatible ShadyCSS version detected. ` +
        `Please update to at least @webcomponents/webcomponentsjs@2.0.2 and ` +
        `@webcomponents/shadycss@1.3.1.`);
    compatibleShadyCSSVersion$1 = false;
}
/**
 * Template factory which scopes template DOM using ShadyCSS.
 * @param scopeName {string}
 */
const shadyTemplateFactory$1 = (scopeName) => (result) => {
    const cacheKey = getTemplateCacheKey$1(result.type, scopeName);
    let templateCache = templateCaches$1.get(cacheKey);
    if (templateCache === undefined) {
        templateCache = {
            stringsArray: new WeakMap(),
            keyString: new Map()
        };
        templateCaches$1.set(cacheKey, templateCache);
    }
    let template = templateCache.stringsArray.get(result.strings);
    if (template !== undefined) {
        return template;
    }
    const key = result.strings.join(marker);
    template = templateCache.keyString.get(key);
    if (template === undefined) {
        const element = result.getTemplateElement();
        if (compatibleShadyCSSVersion$1) {
            window.ShadyCSS.prepareTemplateDom(element, scopeName);
        }
        template = new Template(result, element);
        templateCache.keyString.set(key, template);
    }
    templateCache.stringsArray.set(result.strings, template);
    return template;
};
const TEMPLATE_TYPES = ['html', 'svg'];
/**
 * Removes all style elements from Templates for the given scopeName.
 */
const removeStylesFromLitTemplates = (scopeName) => {
    TEMPLATE_TYPES.forEach((type) => {
        const templates = templateCaches$1.get(getTemplateCacheKey$1(type, scopeName));
        if (templates !== undefined) {
            templates.keyString.forEach((template) => {
                const { element: { content } } = template;
                // IE 11 doesn't support the iterable param Set constructor
                const styles = new Set();
                Array.from(content.querySelectorAll('style')).forEach((s) => {
                    styles.add(s);
                });
                removeNodesFromTemplate(template, styles);
            });
        }
    });
};
const shadyRenderSet = new Set();
/**
 * For the given scope name, ensures that ShadyCSS style scoping is performed.
 * This is done just once per scope name so the fragment and template cannot
 * be modified.
 * (1) extracts styles from the rendered fragment and hands them to ShadyCSS
 * to be scoped and appended to the document
 * (2) removes style elements from all lit-html Templates for this scope name.
 *
 * Note, <style> elements can only be placed into templates for the
 * initial rendering of the scope. If <style> elements are included in templates
 * dynamically rendered to the scope (after the first scope render), they will
 * not be scoped and the <style> will be left in the template and rendered
 * output.
 */
const prepareTemplateStyles = (scopeName, renderedDOM, template) => {
    shadyRenderSet.add(scopeName);
    // If `renderedDOM` is stamped from a Template, then we need to edit that
    // Template's underlying template element. Otherwise, we create one here
    // to give to ShadyCSS, which still requires one while scoping.
    const templateElement = !!template ? template.element : document.createElement('template');
    // Move styles out of rendered DOM and store.
    const styles = renderedDOM.querySelectorAll('style');
    const { length } = styles;
    // If there are no styles, skip unnecessary work
    if (length === 0) {
        // Ensure prepareTemplateStyles is called to support adding
        // styles via `prepareAdoptedCssText` since that requires that
        // `prepareTemplateStyles` is called.
        //
        // ShadyCSS will only update styles containing @apply in the template
        // given to `prepareTemplateStyles`. If no lit Template was given,
        // ShadyCSS will not be able to update uses of @apply in any relevant
        // template. However, this is not a problem because we only create the
        // template for the purpose of supporting `prepareAdoptedCssText`,
        // which doesn't support @apply at all.
        window.ShadyCSS.prepareTemplateStyles(templateElement, scopeName);
        return;
    }
    const condensedStyle = document.createElement('style');
    // Collect styles into a single style. This helps us make sure ShadyCSS
    // manipulations will not prevent us from being able to fix up template
    // part indices.
    // NOTE: collecting styles is inefficient for browsers but ShadyCSS
    // currently does this anyway. When it does not, this should be changed.
    for (let i = 0; i < length; i++) {
        const style = styles[i];
        style.parentNode.removeChild(style);
        condensedStyle.textContent += style.textContent;
    }
    // Remove styles from nested templates in this scope.
    removeStylesFromLitTemplates(scopeName);
    // And then put the condensed style into the "root" template passed in as
    // `template`.
    const content = templateElement.content;
    if (!!template) {
        insertNodeIntoTemplate(template, condensedStyle, content.firstChild);
    }
    else {
        content.insertBefore(condensedStyle, content.firstChild);
    }
    // Note, it's important that ShadyCSS gets the template that `lit-html`
    // will actually render so that it can update the style inside when
    // needed (e.g. @apply native Shadow DOM case).
    window.ShadyCSS.prepareTemplateStyles(templateElement, scopeName);
    const style = content.querySelector('style');
    if (window.ShadyCSS.nativeShadow && style !== null) {
        // When in native Shadow DOM, ensure the style created by ShadyCSS is
        // included in initially rendered output (`renderedDOM`).
        renderedDOM.insertBefore(style.cloneNode(true), renderedDOM.firstChild);
    }
    else if (!!template) {
        // When no style is left in the template, parts will be broken as a
        // result. To fix this, we put back the style node ShadyCSS removed
        // and then tell lit to remove that node from the template.
        // There can be no style in the template in 2 cases (1) when Shady DOM
        // is in use, ShadyCSS removes all styles, (2) when native Shadow DOM
        // is in use ShadyCSS removes the style if it contains no content.
        // NOTE, ShadyCSS creates its own style so we can safely add/remove
        // `condensedStyle` here.
        content.insertBefore(condensedStyle, content.firstChild);
        const removes = new Set();
        removes.add(condensedStyle);
        removeNodesFromTemplate(template, removes);
    }
};
/**
 * Extension to the standard `render` method which supports rendering
 * to ShadowRoots when the ShadyDOM (https://github.com/webcomponents/shadydom)
 * and ShadyCSS (https://github.com/webcomponents/shadycss) polyfills are used
 * or when the webcomponentsjs
 * (https://github.com/webcomponents/webcomponentsjs) polyfill is used.
 *
 * Adds a `scopeName` option which is used to scope element DOM and stylesheets
 * when native ShadowDOM is unavailable. The `scopeName` will be added to
 * the class attribute of all rendered DOM. In addition, any style elements will
 * be automatically re-written with this `scopeName` selector and moved out
 * of the rendered DOM and into the document `<head>`.
 *
 * It is common to use this render method in conjunction with a custom element
 * which renders a shadowRoot. When this is done, typically the element's
 * `localName` should be used as the `scopeName`.
 *
 * In addition to DOM scoping, ShadyCSS also supports a basic shim for css
 * custom properties (needed only on older browsers like IE11) and a shim for
 * a deprecated feature called `@apply` that supports applying a set of css
 * custom properties to a given location.
 *
 * Usage considerations:
 *
 * * Part values in `<style>` elements are only applied the first time a given
 * `scopeName` renders. Subsequent changes to parts in style elements will have
 * no effect. Because of this, parts in style elements should only be used for
 * values that will never change, for example parts that set scope-wide theme
 * values or parts which render shared style elements.
 *
 * * Note, due to a limitation of the ShadyDOM polyfill, rendering in a
 * custom element's `constructor` is not supported. Instead rendering should
 * either done asynchronously, for example at microtask timing (for example
 * `Promise.resolve()`), or be deferred until the first time the element's
 * `connectedCallback` runs.
 *
 * Usage considerations when using shimmed custom properties or `@apply`:
 *
 * * Whenever any dynamic changes are made which affect
 * css custom properties, `ShadyCSS.styleElement(element)` must be called
 * to update the element. There are two cases when this is needed:
 * (1) the element is connected to a new parent, (2) a class is added to the
 * element that causes it to match different custom properties.
 * To address the first case when rendering a custom element, `styleElement`
 * should be called in the element's `connectedCallback`.
 *
 * * Shimmed custom properties may only be defined either for an entire
 * shadowRoot (for example, in a `:host` rule) or via a rule that directly
 * matches an element with a shadowRoot. In other words, instead of flowing from
 * parent to child as do native css custom properties, shimmed custom properties
 * flow only from shadowRoots to nested shadowRoots.
 *
 * * When using `@apply` mixing css shorthand property names with
 * non-shorthand names (for example `border` and `border-width`) is not
 * supported.
 */
const render = (result, container, options) => {
    if (!options || typeof options !== 'object' || !options.scopeName) {
        throw new Error('The `scopeName` option is required.');
    }
    const scopeName = options.scopeName;
    const hasRendered = parts.has(container);
    const needsScoping = compatibleShadyCSSVersion$1 &&
        container.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */ &&
        !!container.host;
    // Handle first render to a scope specially...
    const firstScopeRender = needsScoping && !shadyRenderSet.has(scopeName);
    // On first scope render, render into a fragment; this cannot be a single
    // fragment that is reused since nested renders can occur synchronously.
    const renderContainer = firstScopeRender ? document.createDocumentFragment() : container;
    render$1(result, renderContainer, Object.assign({ templateFactory: shadyTemplateFactory$1(scopeName) }, options));
    // When performing first scope render,
    // (1) We've rendered into a fragment so that there's a chance to
    // `prepareTemplateStyles` before sub-elements hit the DOM
    // (which might cause them to render based on a common pattern of
    // rendering in a custom element's `connectedCallback`);
    // (2) Scope the template with ShadyCSS one time only for this scope.
    // (3) Render the fragment into the container and make sure the
    // container knows its `part` is the one we just rendered. This ensures
    // DOM will be re-used on subsequent renders.
    if (firstScopeRender) {
        const part = parts.get(renderContainer);
        parts.delete(renderContainer);
        // ShadyCSS might have style sheets (e.g. from `prepareAdoptedCssText`)
        // that should apply to `renderContainer` even if the rendered value is
        // not a TemplateInstance. However, it will only insert scoped styles
        // into the document if `prepareTemplateStyles` has already been called
        // for the given scope name.
        const template = part.value instanceof TemplateInstance ?
            part.value.template :
            undefined;
        prepareTemplateStyles(scopeName, renderContainer, template);
        removeNodes(container, container.firstChild);
        container.appendChild(renderContainer);
        parts.set(container, part);
    }
    // After elements have hit the DOM, update styling if this is the
    // initial render to this container.
    // This is needed whenever dynamic changes are made so it would be
    // safest to do every render; however, this would regress performance
    // so we leave it up to the user to call `ShadyCSS.styleElement`
    // for dynamic changes.
    if (!hasRendered && needsScoping) {
        window.ShadyCSS.styleElement(container.host);
    }
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
var _a;
/**
 * Use this module if you want to create your own base class extending
 * [[UpdatingElement]].
 * @packageDocumentation
 */
/*
 * When using Closure Compiler, JSCompiler_renameProperty(property, object) is
 * replaced at compile time by the munged name for object[property]. We cannot
 * alias this function, so we have to use a small shim that has the same
 * behavior when not compiling.
 */
window.JSCompiler_renameProperty =
    (prop, _obj) => prop;
const defaultConverter = {
    toAttribute(value, type) {
        switch (type) {
            case Boolean:
                return value ? '' : null;
            case Object:
            case Array:
                // if the value is `null` or `undefined` pass this through
                // to allow removing/no change behavior.
                return value == null ? value : JSON.stringify(value);
        }
        return value;
    },
    fromAttribute(value, type) {
        switch (type) {
            case Boolean:
                return value !== null;
            case Number:
                return value === null ? null : Number(value);
            case Object:
            case Array:
                return JSON.parse(value);
        }
        return value;
    }
};
/**
 * Change function that returns true if `value` is different from `oldValue`.
 * This method is used as the default for a property's `hasChanged` function.
 */
const notEqual = (value, old) => {
    // This ensures (old==NaN, value==NaN) always returns false
    return old !== value && (old === old || value === value);
};
const defaultPropertyDeclaration = {
    attribute: true,
    type: String,
    converter: defaultConverter,
    reflect: false,
    hasChanged: notEqual
};
const STATE_HAS_UPDATED = 1;
const STATE_UPDATE_REQUESTED = 1 << 2;
const STATE_IS_REFLECTING_TO_ATTRIBUTE = 1 << 3;
const STATE_IS_REFLECTING_TO_PROPERTY = 1 << 4;
/**
 * The Closure JS Compiler doesn't currently have good support for static
 * property semantics where "this" is dynamic (e.g.
 * https://github.com/google/closure-compiler/issues/3177 and others) so we use
 * this hack to bypass any rewriting by the compiler.
 */
const finalized = 'finalized';
/**
 * Base element class which manages element properties and attributes. When
 * properties change, the `update` method is asynchronously called. This method
 * should be supplied by subclassers to render updates as desired.
 * @noInheritDoc
 */
class UpdatingElement extends HTMLElement {
    constructor() {
        super();
        this.initialize();
    }
    /**
     * Returns a list of attributes corresponding to the registered properties.
     * @nocollapse
     */
    static get observedAttributes() {
        // note: piggy backing on this to ensure we're finalized.
        this.finalize();
        const attributes = [];
        // Use forEach so this works even if for/of loops are compiled to for loops
        // expecting arrays
        this._classProperties.forEach((v, p) => {
            const attr = this._attributeNameForProperty(p, v);
            if (attr !== undefined) {
                this._attributeToPropertyMap.set(attr, p);
                attributes.push(attr);
            }
        });
        return attributes;
    }
    /**
     * Ensures the private `_classProperties` property metadata is created.
     * In addition to `finalize` this is also called in `createProperty` to
     * ensure the `@property` decorator can add property metadata.
     */
    /** @nocollapse */
    static _ensureClassProperties() {
        // ensure private storage for property declarations.
        if (!this.hasOwnProperty(JSCompiler_renameProperty('_classProperties', this))) {
            this._classProperties = new Map();
            // NOTE: Workaround IE11 not supporting Map constructor argument.
            const superProperties = Object.getPrototypeOf(this)._classProperties;
            if (superProperties !== undefined) {
                superProperties.forEach((v, k) => this._classProperties.set(k, v));
            }
        }
    }
    /**
     * Creates a property accessor on the element prototype if one does not exist
     * and stores a PropertyDeclaration for the property with the given options.
     * The property setter calls the property's `hasChanged` property option
     * or uses a strict identity check to determine whether or not to request
     * an update.
     *
     * This method may be overridden to customize properties; however,
     * when doing so, it's important to call `super.createProperty` to ensure
     * the property is setup correctly. This method calls
     * `getPropertyDescriptor` internally to get a descriptor to install.
     * To customize what properties do when they are get or set, override
     * `getPropertyDescriptor`. To customize the options for a property,
     * implement `createProperty` like this:
     *
     * static createProperty(name, options) {
     *   options = Object.assign(options, {myOption: true});
     *   super.createProperty(name, options);
     * }
     *
     * @nocollapse
     */
    static createProperty(name, options = defaultPropertyDeclaration) {
        // Note, since this can be called by the `@property` decorator which
        // is called before `finalize`, we ensure storage exists for property
        // metadata.
        this._ensureClassProperties();
        this._classProperties.set(name, options);
        // Do not generate an accessor if the prototype already has one, since
        // it would be lost otherwise and that would never be the user's intention;
        // Instead, we expect users to call `requestUpdate` themselves from
        // user-defined accessors. Note that if the super has an accessor we will
        // still overwrite it
        if (options.noAccessor || this.prototype.hasOwnProperty(name)) {
            return;
        }
        const key = typeof name === 'symbol' ? Symbol() : `__${name}`;
        const descriptor = this.getPropertyDescriptor(name, key, options);
        if (descriptor !== undefined) {
            Object.defineProperty(this.prototype, name, descriptor);
        }
    }
    /**
     * Returns a property descriptor to be defined on the given named property.
     * If no descriptor is returned, the property will not become an accessor.
     * For example,
     *
     *   class MyElement extends LitElement {
     *     static getPropertyDescriptor(name, key, options) {
     *       const defaultDescriptor =
     *           super.getPropertyDescriptor(name, key, options);
     *       const setter = defaultDescriptor.set;
     *       return {
     *         get: defaultDescriptor.get,
     *         set(value) {
     *           setter.call(this, value);
     *           // custom action.
     *         },
     *         configurable: true,
     *         enumerable: true
     *       }
     *     }
     *   }
     *
     * @nocollapse
     */
    static getPropertyDescriptor(name, key, options) {
        return {
            // tslint:disable-next-line:no-any no symbol in index
            get() {
                return this[key];
            },
            set(value) {
                const oldValue = this[name];
                this[key] = value;
                this
                    .requestUpdateInternal(name, oldValue, options);
            },
            configurable: true,
            enumerable: true
        };
    }
    /**
     * Returns the property options associated with the given property.
     * These options are defined with a PropertyDeclaration via the `properties`
     * object or the `@property` decorator and are registered in
     * `createProperty(...)`.
     *
     * Note, this method should be considered "final" and not overridden. To
     * customize the options for a given property, override `createProperty`.
     *
     * @nocollapse
     * @final
     */
    static getPropertyOptions(name) {
        return this._classProperties && this._classProperties.get(name) ||
            defaultPropertyDeclaration;
    }
    /**
     * Creates property accessors for registered properties and ensures
     * any superclasses are also finalized.
     * @nocollapse
     */
    static finalize() {
        // finalize any superclasses
        const superCtor = Object.getPrototypeOf(this);
        if (!superCtor.hasOwnProperty(finalized)) {
            superCtor.finalize();
        }
        this[finalized] = true;
        this._ensureClassProperties();
        // initialize Map populated in observedAttributes
        this._attributeToPropertyMap = new Map();
        // make any properties
        // Note, only process "own" properties since this element will inherit
        // any properties defined on the superClass, and finalization ensures
        // the entire prototype chain is finalized.
        if (this.hasOwnProperty(JSCompiler_renameProperty('properties', this))) {
            const props = this.properties;
            // support symbols in properties (IE11 does not support this)
            const propKeys = [
                ...Object.getOwnPropertyNames(props),
                ...(typeof Object.getOwnPropertySymbols === 'function') ?
                    Object.getOwnPropertySymbols(props) :
                    []
            ];
            // This for/of is ok because propKeys is an array
            for (const p of propKeys) {
                // note, use of `any` is due to TypeSript lack of support for symbol in
                // index types
                // tslint:disable-next-line:no-any no symbol in index
                this.createProperty(p, props[p]);
            }
        }
    }
    /**
     * Returns the property name for the given attribute `name`.
     * @nocollapse
     */
    static _attributeNameForProperty(name, options) {
        const attribute = options.attribute;
        return attribute === false ?
            undefined :
            (typeof attribute === 'string' ?
                attribute :
                (typeof name === 'string' ? name.toLowerCase() : undefined));
    }
    /**
     * Returns true if a property should request an update.
     * Called when a property value is set and uses the `hasChanged`
     * option for the property if present or a strict identity check.
     * @nocollapse
     */
    static _valueHasChanged(value, old, hasChanged = notEqual) {
        return hasChanged(value, old);
    }
    /**
     * Returns the property value for the given attribute value.
     * Called via the `attributeChangedCallback` and uses the property's
     * `converter` or `converter.fromAttribute` property option.
     * @nocollapse
     */
    static _propertyValueFromAttribute(value, options) {
        const type = options.type;
        const converter = options.converter || defaultConverter;
        const fromAttribute = (typeof converter === 'function' ? converter : converter.fromAttribute);
        return fromAttribute ? fromAttribute(value, type) : value;
    }
    /**
     * Returns the attribute value for the given property value. If this
     * returns undefined, the property will *not* be reflected to an attribute.
     * If this returns null, the attribute will be removed, otherwise the
     * attribute will be set to the value.
     * This uses the property's `reflect` and `type.toAttribute` property options.
     * @nocollapse
     */
    static _propertyValueToAttribute(value, options) {
        if (options.reflect === undefined) {
            return;
        }
        const type = options.type;
        const converter = options.converter;
        const toAttribute = converter && converter.toAttribute ||
            defaultConverter.toAttribute;
        return toAttribute(value, type);
    }
    /**
     * Performs element initialization. By default captures any pre-set values for
     * registered properties.
     */
    initialize() {
        this._updateState = 0;
        this._updatePromise =
            new Promise((res) => this._enableUpdatingResolver = res);
        this._changedProperties = new Map();
        this._saveInstanceProperties();
        // ensures first update will be caught by an early access of
        // `updateComplete`
        this.requestUpdateInternal();
    }
    /**
     * Fixes any properties set on the instance before upgrade time.
     * Otherwise these would shadow the accessor and break these properties.
     * The properties are stored in a Map which is played back after the
     * constructor runs. Note, on very old versions of Safari (<=9) or Chrome
     * (<=41), properties created for native platform properties like (`id` or
     * `name`) may not have default values set in the element constructor. On
     * these browsers native properties appear on instances and therefore their
     * default value will overwrite any element default (e.g. if the element sets
     * this.id = 'id' in the constructor, the 'id' will become '' since this is
     * the native platform default).
     */
    _saveInstanceProperties() {
        // Use forEach so this works even if for/of loops are compiled to for loops
        // expecting arrays
        this.constructor
            ._classProperties.forEach((_v, p) => {
            if (this.hasOwnProperty(p)) {
                const value = this[p];
                delete this[p];
                if (!this._instanceProperties) {
                    this._instanceProperties = new Map();
                }
                this._instanceProperties.set(p, value);
            }
        });
    }
    /**
     * Applies previously saved instance properties.
     */
    _applyInstanceProperties() {
        // Use forEach so this works even if for/of loops are compiled to for loops
        // expecting arrays
        // tslint:disable-next-line:no-any
        this._instanceProperties.forEach((v, p) => this[p] = v);
        this._instanceProperties = undefined;
    }
    connectedCallback() {
        // Ensure first connection completes an update. Updates cannot complete
        // before connection.
        this.enableUpdating();
    }
    enableUpdating() {
        if (this._enableUpdatingResolver !== undefined) {
            this._enableUpdatingResolver();
            this._enableUpdatingResolver = undefined;
        }
    }
    /**
     * Allows for `super.disconnectedCallback()` in extensions while
     * reserving the possibility of making non-breaking feature additions
     * when disconnecting at some point in the future.
     */
    disconnectedCallback() {
    }
    /**
     * Synchronizes property values when attributes change.
     */
    attributeChangedCallback(name, old, value) {
        if (old !== value) {
            this._attributeToProperty(name, value);
        }
    }
    _propertyToAttribute(name, value, options = defaultPropertyDeclaration) {
        const ctor = this.constructor;
        const attr = ctor._attributeNameForProperty(name, options);
        if (attr !== undefined) {
            const attrValue = ctor._propertyValueToAttribute(value, options);
            // an undefined value does not change the attribute.
            if (attrValue === undefined) {
                return;
            }
            // Track if the property is being reflected to avoid
            // setting the property again via `attributeChangedCallback`. Note:
            // 1. this takes advantage of the fact that the callback is synchronous.
            // 2. will behave incorrectly if multiple attributes are in the reaction
            // stack at time of calling. However, since we process attributes
            // in `update` this should not be possible (or an extreme corner case
            // that we'd like to discover).
            // mark state reflecting
            this._updateState = this._updateState | STATE_IS_REFLECTING_TO_ATTRIBUTE;
            if (attrValue == null) {
                this.removeAttribute(attr);
            }
            else {
                this.setAttribute(attr, attrValue);
            }
            // mark state not reflecting
            this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_ATTRIBUTE;
        }
    }
    _attributeToProperty(name, value) {
        // Use tracking info to avoid deserializing attribute value if it was
        // just set from a property setter.
        if (this._updateState & STATE_IS_REFLECTING_TO_ATTRIBUTE) {
            return;
        }
        const ctor = this.constructor;
        // Note, hint this as an `AttributeMap` so closure clearly understands
        // the type; it has issues with tracking types through statics
        // tslint:disable-next-line:no-unnecessary-type-assertion
        const propName = ctor._attributeToPropertyMap.get(name);
        if (propName !== undefined) {
            const options = ctor.getPropertyOptions(propName);
            // mark state reflecting
            this._updateState = this._updateState | STATE_IS_REFLECTING_TO_PROPERTY;
            this[propName] =
                // tslint:disable-next-line:no-any
                ctor._propertyValueFromAttribute(value, options);
            // mark state not reflecting
            this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_PROPERTY;
        }
    }
    /**
     * This protected version of `requestUpdate` does not access or return the
     * `updateComplete` promise. This promise can be overridden and is therefore
     * not free to access.
     */
    requestUpdateInternal(name, oldValue, options) {
        let shouldRequestUpdate = true;
        // If we have a property key, perform property update steps.
        if (name !== undefined) {
            const ctor = this.constructor;
            options = options || ctor.getPropertyOptions(name);
            if (ctor._valueHasChanged(this[name], oldValue, options.hasChanged)) {
                if (!this._changedProperties.has(name)) {
                    this._changedProperties.set(name, oldValue);
                }
                // Add to reflecting properties set.
                // Note, it's important that every change has a chance to add the
                // property to `_reflectingProperties`. This ensures setting
                // attribute + property reflects correctly.
                if (options.reflect === true &&
                    !(this._updateState & STATE_IS_REFLECTING_TO_PROPERTY)) {
                    if (this._reflectingProperties === undefined) {
                        this._reflectingProperties = new Map();
                    }
                    this._reflectingProperties.set(name, options);
                }
            }
            else {
                // Abort the request if the property should not be considered changed.
                shouldRequestUpdate = false;
            }
        }
        if (!this._hasRequestedUpdate && shouldRequestUpdate) {
            this._updatePromise = this._enqueueUpdate();
        }
    }
    /**
     * Requests an update which is processed asynchronously. This should
     * be called when an element should update based on some state not triggered
     * by setting a property. In this case, pass no arguments. It should also be
     * called when manually implementing a property setter. In this case, pass the
     * property `name` and `oldValue` to ensure that any configured property
     * options are honored. Returns the `updateComplete` Promise which is resolved
     * when the update completes.
     *
     * @param name {PropertyKey} (optional) name of requesting property
     * @param oldValue {any} (optional) old value of requesting property
     * @returns {Promise} A Promise that is resolved when the update completes.
     */
    requestUpdate(name, oldValue) {
        this.requestUpdateInternal(name, oldValue);
        return this.updateComplete;
    }
    /**
     * Sets up the element to asynchronously update.
     */
    async _enqueueUpdate() {
        this._updateState = this._updateState | STATE_UPDATE_REQUESTED;
        try {
            // Ensure any previous update has resolved before updating.
            // This `await` also ensures that property changes are batched.
            await this._updatePromise;
        }
        catch (e) {
            // Ignore any previous errors. We only care that the previous cycle is
            // done. Any error should have been handled in the previous update.
        }
        const result = this.performUpdate();
        // If `performUpdate` returns a Promise, we await it. This is done to
        // enable coordinating updates with a scheduler. Note, the result is
        // checked to avoid delaying an additional microtask unless we need to.
        if (result != null) {
            await result;
        }
        return !this._hasRequestedUpdate;
    }
    get _hasRequestedUpdate() {
        return (this._updateState & STATE_UPDATE_REQUESTED);
    }
    get hasUpdated() {
        return (this._updateState & STATE_HAS_UPDATED);
    }
    /**
     * Performs an element update. Note, if an exception is thrown during the
     * update, `firstUpdated` and `updated` will not be called.
     *
     * You can override this method to change the timing of updates. If this
     * method is overridden, `super.performUpdate()` must be called.
     *
     * For instance, to schedule updates to occur just before the next frame:
     *
     * ```
     * protected async performUpdate(): Promise<unknown> {
     *   await new Promise((resolve) => requestAnimationFrame(() => resolve()));
     *   super.performUpdate();
     * }
     * ```
     */
    performUpdate() {
        // Abort any update if one is not pending when this is called.
        // This can happen if `performUpdate` is called early to "flush"
        // the update.
        if (!this._hasRequestedUpdate) {
            return;
        }
        // Mixin instance properties once, if they exist.
        if (this._instanceProperties) {
            this._applyInstanceProperties();
        }
        let shouldUpdate = false;
        const changedProperties = this._changedProperties;
        try {
            shouldUpdate = this.shouldUpdate(changedProperties);
            if (shouldUpdate) {
                this.update(changedProperties);
            }
            else {
                this._markUpdated();
            }
        }
        catch (e) {
            // Prevent `firstUpdated` and `updated` from running when there's an
            // update exception.
            shouldUpdate = false;
            // Ensure element can accept additional updates after an exception.
            this._markUpdated();
            throw e;
        }
        if (shouldUpdate) {
            if (!(this._updateState & STATE_HAS_UPDATED)) {
                this._updateState = this._updateState | STATE_HAS_UPDATED;
                this.firstUpdated(changedProperties);
            }
            this.updated(changedProperties);
        }
    }
    _markUpdated() {
        this._changedProperties = new Map();
        this._updateState = this._updateState & ~STATE_UPDATE_REQUESTED;
    }
    /**
     * Returns a Promise that resolves when the element has completed updating.
     * The Promise value is a boolean that is `true` if the element completed the
     * update without triggering another update. The Promise result is `false` if
     * a property was set inside `updated()`. If the Promise is rejected, an
     * exception was thrown during the update.
     *
     * To await additional asynchronous work, override the `_getUpdateComplete`
     * method. For example, it is sometimes useful to await a rendered element
     * before fulfilling this Promise. To do this, first await
     * `super._getUpdateComplete()`, then any subsequent state.
     *
     * @returns {Promise} The Promise returns a boolean that indicates if the
     * update resolved without triggering another update.
     */
    get updateComplete() {
        return this._getUpdateComplete();
    }
    /**
     * Override point for the `updateComplete` promise.
     *
     * It is not safe to override the `updateComplete` getter directly due to a
     * limitation in TypeScript which means it is not possible to call a
     * superclass getter (e.g. `super.updateComplete.then(...)`) when the target
     * language is ES5 (https://github.com/microsoft/TypeScript/issues/338).
     * This method should be overridden instead. For example:
     *
     *   class MyElement extends LitElement {
     *     async _getUpdateComplete() {
     *       await super._getUpdateComplete();
     *       await this._myChild.updateComplete;
     *     }
     *   }
     */
    _getUpdateComplete() {
        return this._updatePromise;
    }
    /**
     * Controls whether or not `update` should be called when the element requests
     * an update. By default, this method always returns `true`, but this can be
     * customized to control when to update.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    shouldUpdate(_changedProperties) {
        return true;
    }
    /**
     * Updates the element. This method reflects property values to attributes.
     * It can be overridden to render and keep updated element DOM.
     * Setting properties inside this method will *not* trigger
     * another update.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    update(_changedProperties) {
        if (this._reflectingProperties !== undefined &&
            this._reflectingProperties.size > 0) {
            // Use forEach so this works even if for/of loops are compiled to for
            // loops expecting arrays
            this._reflectingProperties.forEach((v, k) => this._propertyToAttribute(k, this[k], v));
            this._reflectingProperties = undefined;
        }
        this._markUpdated();
    }
    /**
     * Invoked whenever the element is updated. Implement to perform
     * post-updating tasks via DOM APIs, for example, focusing an element.
     *
     * Setting properties inside this method will trigger the element to update
     * again after this update cycle completes.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    updated(_changedProperties) {
    }
    /**
     * Invoked when the element is first updated. Implement to perform one time
     * work on the element after update.
     *
     * Setting properties inside this method will trigger the element to update
     * again after this update cycle completes.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    firstUpdated(_changedProperties) {
    }
}
_a = finalized;
/**
 * Marks class as having finished creating properties.
 */
UpdatingElement[_a] = true;

/**
@license
Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at
http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
part of the polymer project is also subject to an additional IP rights grant
found at http://polymer.github.io/PATENTS.txt
*/
/**
 * Whether the current browser supports `adoptedStyleSheets`.
 */
const supportsAdoptingStyleSheets = (window.ShadowRoot) &&
    (window.ShadyCSS === undefined || window.ShadyCSS.nativeShadow) &&
    ('adoptedStyleSheets' in Document.prototype) &&
    ('replace' in CSSStyleSheet.prototype);
const constructionToken = Symbol();
class CSSResult {
    constructor(cssText, safeToken) {
        if (safeToken !== constructionToken) {
            throw new Error('CSSResult is not constructable. Use `unsafeCSS` or `css` instead.');
        }
        this.cssText = cssText;
    }
    // Note, this is a getter so that it's lazy. In practice, this means
    // stylesheets are not created until the first element instance is made.
    get styleSheet() {
        if (this._styleSheet === undefined) {
            // Note, if `supportsAdoptingStyleSheets` is true then we assume
            // CSSStyleSheet is constructable.
            if (supportsAdoptingStyleSheets) {
                this._styleSheet = new CSSStyleSheet();
                this._styleSheet.replaceSync(this.cssText);
            }
            else {
                this._styleSheet = null;
            }
        }
        return this._styleSheet;
    }
    toString() {
        return this.cssText;
    }
}
/**
 * Wrap a value for interpolation in a [[`css`]] tagged template literal.
 *
 * This is unsafe because untrusted CSS text can be used to phone home
 * or exfiltrate data to an attacker controlled site. Take care to only use
 * this with trusted input.
 */
const unsafeCSS = (value) => {
    return new CSSResult(String(value), constructionToken);
};
const textFromCSSResult = (value) => {
    if (value instanceof CSSResult) {
        return value.cssText;
    }
    else if (typeof value === 'number') {
        return value;
    }
    else {
        throw new Error(`Value passed to 'css' function must be a 'css' function result: ${value}. Use 'unsafeCSS' to pass non-literal values, but
            take care to ensure page security.`);
    }
};
/**
 * Template tag which which can be used with LitElement's [[LitElement.styles |
 * `styles`]] property to set element styles. For security reasons, only literal
 * string values may be used. To incorporate non-literal values [[`unsafeCSS`]]
 * may be used inside a template string part.
 */
const css = (strings, ...values) => {
    const cssText = values.reduce((acc, v, idx) => acc + textFromCSSResult(v) + strings[idx + 1], strings[0]);
    return new CSSResult(cssText, constructionToken);
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// IMPORTANT: do not change the property name or the assignment expression.
// This line will be used in regexes to search for LitElement usage.
// TODO(justinfagnani): inject version number at build time
(window['litElementVersions'] || (window['litElementVersions'] = []))
    .push('2.4.0');
/**
 * Sentinal value used to avoid calling lit-html's render function when
 * subclasses do not implement `render`
 */
const renderNotImplemented = {};
/**
 * Base element class that manages element properties and attributes, and
 * renders a lit-html template.
 *
 * To define a component, subclass `LitElement` and implement a
 * `render` method to provide the component's template. Define properties
 * using the [[`properties`]] property or the [[`property`]] decorator.
 */
class LitElement extends UpdatingElement {
    /**
     * Return the array of styles to apply to the element.
     * Override this method to integrate into a style management system.
     *
     * @nocollapse
     */
    static getStyles() {
        return this.styles;
    }
    /** @nocollapse */
    static _getUniqueStyles() {
        // Only gather styles once per class
        if (this.hasOwnProperty(JSCompiler_renameProperty('_styles', this))) {
            return;
        }
        // Take care not to call `this.getStyles()` multiple times since this
        // generates new CSSResults each time.
        // TODO(sorvell): Since we do not cache CSSResults by input, any
        // shared styles will generate new stylesheet objects, which is wasteful.
        // This should be addressed when a browser ships constructable
        // stylesheets.
        const userStyles = this.getStyles();
        if (Array.isArray(userStyles)) {
            // De-duplicate styles preserving the _last_ instance in the set.
            // This is a performance optimization to avoid duplicated styles that can
            // occur especially when composing via subclassing.
            // The last item is kept to try to preserve the cascade order with the
            // assumption that it's most important that last added styles override
            // previous styles.
            const addStyles = (styles, set) => styles.reduceRight((set, s) => 
            // Note: On IE set.add() does not return the set
            Array.isArray(s) ? addStyles(s, set) : (set.add(s), set), set);
            // Array.from does not work on Set in IE, otherwise return
            // Array.from(addStyles(userStyles, new Set<CSSResult>())).reverse()
            const set = addStyles(userStyles, new Set());
            const styles = [];
            set.forEach((v) => styles.unshift(v));
            this._styles = styles;
        }
        else {
            this._styles = userStyles === undefined ? [] : [userStyles];
        }
        // Ensure that there are no invalid CSSStyleSheet instances here. They are
        // invalid in two conditions.
        // (1) the sheet is non-constructible (`sheet` of a HTMLStyleElement), but
        //     this is impossible to check except via .replaceSync or use
        // (2) the ShadyCSS polyfill is enabled (:. supportsAdoptingStyleSheets is
        //     false)
        this._styles = this._styles.map((s) => {
            if (s instanceof CSSStyleSheet && !supportsAdoptingStyleSheets) {
                // Flatten the cssText from the passed constructible stylesheet (or
                // undetectable non-constructible stylesheet). The user might have
                // expected to update their stylesheets over time, but the alternative
                // is a crash.
                const cssText = Array.prototype.slice.call(s.cssRules)
                    .reduce((css, rule) => css + rule.cssText, '');
                return unsafeCSS(cssText);
            }
            return s;
        });
    }
    /**
     * Performs element initialization. By default this calls
     * [[`createRenderRoot`]] to create the element [[`renderRoot`]] node and
     * captures any pre-set values for registered properties.
     */
    initialize() {
        super.initialize();
        this.constructor._getUniqueStyles();
        this.renderRoot = this.createRenderRoot();
        // Note, if renderRoot is not a shadowRoot, styles would/could apply to the
        // element's getRootNode(). While this could be done, we're choosing not to
        // support this now since it would require different logic around de-duping.
        if (window.ShadowRoot && this.renderRoot instanceof window.ShadowRoot) {
            this.adoptStyles();
        }
    }
    /**
     * Returns the node into which the element should render and by default
     * creates and returns an open shadowRoot. Implement to customize where the
     * element's DOM is rendered. For example, to render into the element's
     * childNodes, return `this`.
     * @returns {Element|DocumentFragment} Returns a node into which to render.
     */
    createRenderRoot() {
        return this.attachShadow({ mode: 'open' });
    }
    /**
     * Applies styling to the element shadowRoot using the [[`styles`]]
     * property. Styling will apply using `shadowRoot.adoptedStyleSheets` where
     * available and will fallback otherwise. When Shadow DOM is polyfilled,
     * ShadyCSS scopes styles and adds them to the document. When Shadow DOM
     * is available but `adoptedStyleSheets` is not, styles are appended to the
     * end of the `shadowRoot` to [mimic spec
     * behavior](https://wicg.github.io/construct-stylesheets/#using-constructed-stylesheets).
     */
    adoptStyles() {
        const styles = this.constructor._styles;
        if (styles.length === 0) {
            return;
        }
        // There are three separate cases here based on Shadow DOM support.
        // (1) shadowRoot polyfilled: use ShadyCSS
        // (2) shadowRoot.adoptedStyleSheets available: use it
        // (3) shadowRoot.adoptedStyleSheets polyfilled: append styles after
        // rendering
        if (window.ShadyCSS !== undefined && !window.ShadyCSS.nativeShadow) {
            window.ShadyCSS.ScopingShim.prepareAdoptedCssText(styles.map((s) => s.cssText), this.localName);
        }
        else if (supportsAdoptingStyleSheets) {
            this.renderRoot.adoptedStyleSheets =
                styles.map((s) => s instanceof CSSStyleSheet ? s : s.styleSheet);
        }
        else {
            // This must be done after rendering so the actual style insertion is done
            // in `update`.
            this._needsShimAdoptedStyleSheets = true;
        }
    }
    connectedCallback() {
        super.connectedCallback();
        // Note, first update/render handles styleElement so we only call this if
        // connected after first update.
        if (this.hasUpdated && window.ShadyCSS !== undefined) {
            window.ShadyCSS.styleElement(this);
        }
    }
    /**
     * Updates the element. This method reflects property values to attributes
     * and calls `render` to render DOM via lit-html. Setting properties inside
     * this method will *not* trigger another update.
     * @param _changedProperties Map of changed properties with old values
     */
    update(changedProperties) {
        // Setting properties in `render` should not trigger an update. Since
        // updates are allowed after super.update, it's important to call `render`
        // before that.
        const templateResult = this.render();
        super.update(changedProperties);
        // If render is not implemented by the component, don't call lit-html render
        if (templateResult !== renderNotImplemented) {
            this.constructor
                .render(templateResult, this.renderRoot, { scopeName: this.localName, eventContext: this });
        }
        // When native Shadow DOM is used but adoptedStyles are not supported,
        // insert styling after rendering to ensure adoptedStyles have highest
        // priority.
        if (this._needsShimAdoptedStyleSheets) {
            this._needsShimAdoptedStyleSheets = false;
            this.constructor._styles.forEach((s) => {
                const style = document.createElement('style');
                style.textContent = s.cssText;
                this.renderRoot.appendChild(style);
            });
        }
    }
    /**
     * Invoked on each update to perform rendering tasks. This method may return
     * any value renderable by lit-html's `NodePart` - typically a
     * `TemplateResult`. Setting properties inside this method will *not* trigger
     * the element to update.
     */
    render() {
        return renderNotImplemented;
    }
}
/**
 * Ensure this class is marked as `finalized` as an optimization ensuring
 * it will not needlessly try to `finalize`.
 *
 * Note this property name is a string to prevent breaking Closure JS Compiler
 * optimizations. See updating-element.ts for more information.
 */
LitElement['finalized'] = true;
/**
 * Reference to the underlying library method used to render the element's
 * DOM. By default, points to the `render` method from lit-html's shady-render
 * module.
 *
 * **Most users will never need to touch this property.**
 *
 * This  property should not be confused with the `render` instance method,
 * which should be overridden to define a template for the element.
 *
 * Advanced users creating a new base class based on LitElement can override
 * this property to point to a custom render method with a signature that
 * matches [shady-render's `render`
 * method](https://lit-html.polymer-project.org/api/modules/shady_render.html#render).
 *
 * @nocollapse
 */
LitElement.render = render;

/**
 * @license
 * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const previousValues = new WeakMap();
/**
 * For AttributeParts, sets the attribute if the value is defined and removes
 * the attribute if the value is undefined.
 *
 * For other part types, this directive is a no-op.
 */
const ifDefined = directive((value) => (part) => {
    const previousValue = previousValues.get(part);
    if (value === undefined && part instanceof AttributePart) {
        // If the value is undefined, remove the attribute, but only if the value
        // was previously defined.
        if (previousValue !== undefined || !previousValues.has(part)) {
            const name = part.committer.name;
            part.committer.element.removeAttribute(name);
        }
    }
    else if (value !== previousValue) {
        part.setValue(value);
    }
    previousValues.set(part, value);
});

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const _state = new WeakMap();
// Effectively infinity, but a SMI.
const _infinity = 0x7fffffff;
/**
 * Renders one of a series of values, including Promises, to a Part.
 *
 * Values are rendered in priority order, with the first argument having the
 * highest priority and the last argument having the lowest priority. If a
 * value is a Promise, low-priority values will be rendered until it resolves.
 *
 * The priority of values can be used to create placeholder content for async
 * data. For example, a Promise with pending content can be the first,
 * highest-priority, argument, and a non_promise loading indicator template can
 * be used as the second, lower-priority, argument. The loading indicator will
 * render immediately, and the primary content will render when the Promise
 * resolves.
 *
 * Example:
 *
 *     const content = fetch('./content.txt').then(r => r.text());
 *     html`${until(content, html`<span>Loading...</span>`)}`
 */
const until = directive((...args) => (part) => {
    let state = _state.get(part);
    if (state === undefined) {
        state = {
            lastRenderedIndex: _infinity,
            values: [],
        };
        _state.set(part, state);
    }
    const previousValues = state.values;
    let previousLength = previousValues.length;
    state.values = args;
    for (let i = 0; i < args.length; i++) {
        // If we've rendered a higher-priority value already, stop.
        if (i > state.lastRenderedIndex) {
            break;
        }
        const value = args[i];
        // Render non-Promise values immediately
        if (isPrimitive(value) ||
            typeof value.then !== 'function') {
            part.setValue(value);
            state.lastRenderedIndex = i;
            // Since a lower-priority value will never overwrite a higher-priority
            // synchronous value, we can stop processing now.
            break;
        }
        // If this is a Promise we've already handled, skip it.
        if (i < previousLength && value === previousValues[i]) {
            continue;
        }
        // We have a Promise that we haven't seen before, so priorities may have
        // changed. Forget what we rendered before.
        state.lastRenderedIndex = _infinity;
        previousLength = 0;
        Promise.resolve(value).then((resolvedValue) => {
            const index = state.values.indexOf(value);
            // If state.values doesn't contain the value, we've re-rendered without
            // the value, so don't render it. Then, only render if the value is
            // higher-priority than what's already been rendered.
            if (index > -1 && index < state.lastRenderedIndex) {
                state.lastRenderedIndex = index;
                part.setValue(resolvedValue);
                part.commit();
            }
        });
    }
});

const appliedClassMixins = new WeakMap();

/** Vefify if the Mixin was previously applyed
 * @private
 * @param {function} mixin      Mixin being applyed
 * @param {object} superClass   Class receiving the new mixin
 * @returns {boolean}
 */
function wasMixinPreviouslyApplied(mixin, superClass) {
  let klass = superClass;
  while (klass) {
    if (appliedClassMixins.get(klass) === mixin) {
      return true;
    }
    klass = Object.getPrototypeOf(klass);
  }
  return false;
}

/** Apply each mixin in the chain to make sure they are not applied more than once to the final class.
 * @export
 * @param {function} mixin      Mixin to be applyed
 * @returns {object}            Mixed class with mixin applied
 */
function dedupeMixin(mixin) {
  return superClass => {
    if (wasMixinPreviouslyApplied(mixin, superClass)) {
      return superClass;
    }
    const mixedClass = mixin(superClass);
    appliedClassMixins.set(mixedClass, mixin);
    return mixedClass;
  };
}

/**
 * Cache class that allows to search in a cache hierarchy.
 * @template T, Q
 */
class Cache {
  /**
   * Creates a Cache instance
   * @param {Cache} [parent]
   */
  constructor(parent) {
    this._parent = parent;
    this._cache = new Map();
  }

  /**
   * Returns a boolean indicating whether an element with the specified key exists or not.
   *
   * @param {T} key - The key of the element to test for presence in the Cache object.
   * @return {boolean}
   */
  has(key) {
    return !!(this._cache.has(key) || (this._parent && this._parent._cache.has(key)));
  }

  /**
   * Adds or updates an element with a specified key and a value to a Cache object.
   *
   * @param {T} key - The key of the element to add to the Cache object.
   * @param {Q} value - The value of the element to add to the Cache object.
   * @return {Cache<T, Q>} the cache object
   */
  set(key, value) {
    this._cache.set(key, value);

    return this;
  }

  /**
   * Returns a specified element from a Map object. If the value that is associated to the provided key is an
   * object, then you will get a reference to that object and any change made to that object will effectively modify
   * it inside the Map object.
   *
   * @param {T} key - The key of the element to return from the Cache object.
   * @return {Q}
   */
  get(key) {
    return this._cache.get(key) || (this._parent && this._parent._cache.get(key));
  }
}

/**
 * Global counter to scope the custom elements
 *
 * @type {number}
 */
let counter = Math.round(Math.random() * 100000);

/**
 * Allowed tag name chars
 *
 * @type {string}
 */
const chars$1 = `-|\\.|[0-9]|[a-z]`;

/**
 * Regular expression to check if a value is a valid tag name
 *
 * @type {RegExp}
 */
const tagRegExp = new RegExp(`[a-z](${chars$1})*-(${chars$1})*`);

/**
 * Checks if the tag name is valid
 *
 * @param {string} tag
 * @returns {boolean}
 */
const isValid = tag => tagRegExp.exec(tag) !== null;

/**
 * Checks if the tag is already registered
 *
 * @param {string} name
 * @param {CustomElementRegistry} registry
 * @returns {boolean}
 */
const isTagRegistered = (name, registry) => !!registry.get(name);

/**
 * Given a tag name scopes it with a number suffix
 *
 * @param {string} tagName
 * @param {CustomElementRegistry} registry
 * @returns {string} scoped tag name
 */
const incrementTagName = (tagName, registry) => {
  const newTagName = `${tagName}-${(counter += 1)}`;

  if (isTagRegistered(newTagName, registry)) {
    return incrementTagName(tagName, registry);
  }

  return newTagName;
};

/**
 * Creates a unique scoped tag name
 *
 * @exports
 * @param {string} tagName - tag name to scope
 * @param {CustomElementRegistry} registry
 * @returns {string} scoped tag name
 */
function createUniqueTag(tagName, registry = customElements) {
  if (!isValid(tagName)) {
    throw new Error('tagName is invalid');
  }

  return incrementTagName(tagName, registry);
}

/**
 * The global cache for tag names
 *
 * @type {WeakMap<typeof HTMLElement, string>}
 */
const globalTagsCache = new WeakMap();

/**
 * Adds a tag to the global tags cache
 *
 * @param {string} tag
 * @param {typeof HTMLElement} klass
 */
const addToGlobalTagsCache = (tag, klass) => globalTagsCache.set(klass, tag);

/**
 * Gets a tag from the global tags cache
 *
 * @exports
 * @param {typeof HTMLElement} klass
 * @returns {undefined|string}
 */
const getFromGlobalTagsCache = klass => globalTagsCache.get(klass);

/**
 * Checks if klass is a subclass of HTMLElement
 *
 * @param {typeof HTMLElement} klass
 * @returns {boolean}
 */
const extendsHTMLElement = klass => Object.prototype.isPrototypeOf.call(HTMLElement, klass);

/**
 * Defines a custom element
 *
 * @param {string} tagName
 * @param {typeof HTMLElement} klass
 * @param {CustomElementRegistry} registry
 */
const defineElement = (tagName, klass, registry = customElements) => {
  addToGlobalTagsCache(tagName, klass);
  registry.define(tagName, class extends klass {});
};

/**
 * Stores a lazy element in the cache to be used in future
 *
 * @param {string} tagName
 * @param {CustomElementRegistry} registry
 * @param {import('./Cache.js').Cache<string, string>} tagsCache
 * @returns {string}
 */
const storeLazyElementInCache = (tagName, registry, tagsCache) => {
  const tag = createUniqueTag(tagName, registry);

  if (!tagsCache) {
    throw new Error('Lazy scoped elements requires the use of tags cache');
  }

  tagsCache.set(tagName, tag);

  return tag;
};

/**
 * Define a scoped custom element storing the scoped tag name in the cache
 *
 * @param {string} tagName
 * @param {typeof HTMLElement} klass
 * @param {import('./Cache.js').Cache<string, string>} tagsCache
 * @returns {string}
 */
const defineElementAndStoreInCache = (tagName, klass, tagsCache) => {
  const registry = customElements;

  if (!extendsHTMLElement(klass)) {
    return storeLazyElementInCache(tagName, registry, tagsCache);
  }

  if (klass === customElements.get(tagName)) {
    addToGlobalTagsCache(tagName, klass);

    return tagName;
  }

  const tag = createUniqueTag(tagName, registry);
  // @ts-ignore
  // we extend it just in case the class has been defined manually
  defineElement(tag, klass, registry);

  return tag;
};

/**
 * Gets a scoped tag name from the cache or generates a new one and defines the element if needed
 *
 * @exports
 * @param {string} tagName
 * @param {typeof HTMLElement} klass
 * @param {import('./Cache.js').Cache<string, string>} tagsCache
 * @returns {string}
 */
function registerElement(tagName, klass, tagsCache = undefined) {
  const tag =
    getFromGlobalTagsCache(klass) ||
    (tagsCache && tagsCache.get(tagName)) ||
    defineElementAndStoreInCache(tagName, klass, tagsCache);

  return tag;
}

/**
 * Defines a lazy element
 *
 * @param {string} tagName
 * @param {typeof HTMLElement} klass
 * @param {import('./Cache.js').Cache<string, string>} tagsCache
 */
function defineScopedElement(tagName, klass, tagsCache) {
  const tag = tagsCache.get(tagName);

  if (tag) {
    if (customElements.get(tag) === undefined) {
      defineElement(tag, klass, customElements);
    }
  } else {
    tagsCache.set(tagName, registerElement(tagName, klass, tagsCache));
  }
}

/**
 * @typedef {import('./types').ScopedElementsMap} ScopedElementsMap
 */

/**
 * Allowed tag name chars
 *
 * @type {string}
 */
const chars = `-|\\.|[0-9]|[a-z]`;

/**
 * Regular Expression to find a custom element tag
 *
 * @type {RegExp}
 */
const re = new RegExp(`<\\/?([a-z](${chars})*-(${chars})*)`, 'g');

/**
 * The global cache of processed string arrays
 *
 * @type {Cache<TemplateStringsArray, TemplateStringsArray>}
 */
const globalCache = new Cache();

/**
 * Find custom element tags in the string
 *
 * @param {string} str
 * @returns {RegExpExecArray[]}
 */
const matchAll = str => {
  const matches = [];
  let result;
  // eslint-disable-next-line no-cond-assign
  while ((result = re.exec(str)) !== null) {
    matches.push(result);
  }

  return matches;
};

/**
 * Transforms a string array into another one with resolved scoped elements and caches it for future references
 *
 * @param {TemplateStringsArray} strings
 * @param {ScopedElementsMap} scopedElements
 * @param {Cache<TemplateStringsArray, TemplateStringsArray>} templateCache
 * @param {Cache<string, string>} tagsCache
 * @returns {TemplateStringsArray}
 */
const transformTemplate$1 = (strings, scopedElements, templateCache, tagsCache) => {
  const transformedStrings = strings.map(str => {
    let acc = str;
    const matches = matchAll(str);

    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const item = matches[i];
      const [block, tagName] = item;
      const tag = registerElement(tagName, scopedElements[tagName], tagsCache);
      const start = item.index + block.length - tagName.length;
      const end = start + tagName.length;
      const isClosingTag = block.indexOf('</') === 0;

      acc =
        acc.slice(0, start) +
        (isClosingTag ? tag : `${tag} data-tag-name="${tagName}"`) +
        acc.slice(end);
    }

    return acc;
  });

  // @ts-ignore
  // noinspection JSCheckFunctionSignatures
  templateCache.set(strings, transformedStrings);

  // @ts-ignore
  // noinspection JSValidateTypes
  return transformedStrings;
};

/**
 * Obtains the cached strings array with resolved scoped elements or creates it
 *
 * @exports
 * @param {TemplateStringsArray} strings
 * @param {ScopedElementsMap} scopedElements
 * @param {import('./Cache.js').Cache<TemplateStringsArray, TemplateStringsArray>} templateCache
 * @param {import('./Cache.js').Cache<string, string>} tagsCache
 * @returns {TemplateStringsArray}
 */
function transform(strings, scopedElements, templateCache = globalCache, tagsCache) {
  return (
    templateCache.get(strings) ||
    transformTemplate$1(strings, scopedElements, templateCache, tagsCache)
  );
}

const getTemplateCacheKey = (type, scopeName) => `${type}--${scopeName}`;

let compatibleShadyCSSVersion = true;

// @ts-ignore
const { ShadyCSS } = window;

if (typeof ShadyCSS === 'undefined') {
  compatibleShadyCSSVersion = false;
} else if (typeof ShadyCSS.prepareTemplateDom === 'undefined') {
  compatibleShadyCSSVersion = false;
}

/**
 * Template factory which scopes template DOM using ShadyCSS.
 * @param scopeName {string}
 */
const shadyTemplateFactory = scopeName => result => {
  const cacheKey = getTemplateCacheKey(result.type, scopeName);
  let templateCache = templateCaches$1.get(cacheKey);
  if (templateCache === undefined) {
    templateCache = {
      stringsArray: new WeakMap(),
      keyString: new Map(),
    };
    templateCaches$1.set(cacheKey, templateCache);
  }
  let template = templateCache.stringsArray.get(result.strings);
  if (template !== undefined) {
    return template;
  }
  const key = result.strings.join(marker);
  template = templateCache.keyString.get(key);
  if (template === undefined) {
    const element = result.getTemplateElement();
    if (compatibleShadyCSSVersion) {
      ShadyCSS.prepareTemplateDom(element, scopeName);
    }
    template = new Template(result, element);
    templateCache.keyString.set(key, template);
  }
  templateCache.stringsArray.set(result.strings, template);
  return template;
};

/* eslint-disable no-use-before-define */

/**
 * @typedef {import('./types').ScopedElementsMixin} ScopedElementsMixin
 * @typedef {import('./types').ScopedElementsMap} ScopedElementsMap
 * @typedef {import("lit-element").LitElement} LitElement
 * @typedef {import('lit-html/lib/shady-render').ShadyRenderOptions} ShadyRenderOptions
 * @typedef {function(TemplateResult, Element|DocumentFragment|ShadowRoot, ShadyRenderOptions): void} RenderFunction
 */

/**
 * Template caches
 *
 * @type {WeakMap<Function, Cache<TemplateStringsArray, TemplateStringsArray>>}
 */
const templateCaches = new WeakMap();

/**
 * Retrieves or creates a templateCache for a specific key
 *
 * @param {Function} key
 * @returns {Cache<TemplateStringsArray, TemplateStringsArray>}
 */
const getTemplateCache = key => {
  if (!templateCaches.has(key)) {
    // @ts-ignore
    templateCaches.set(key, new Cache(templateCaches.get(key.constructor)));
  }

  return templateCaches.get(key);
};

/**
 * Tags caches
 *
 * @type {WeakMap<object, Cache<string, string>>}
 */
const tagsCaches = new WeakMap();

/**
 * Retrieves or creates a tagsCache for a specific key
 * @param {object} key
 * @returns {Cache<string, string>}
 */
const getTagsCache = key => {
  if (!tagsCaches.has(key)) {
    tagsCaches.set(key, new Cache(tagsCaches.get(key.constructor)));
  }

  return tagsCaches.get(key);
};

/**
 * Transforms an array of TemplateResults or arrays into another one with resolved scoped elements
 *
 * @param {ReadonlyArray} items
 * @param {ScopedElementsMap} scopedElements
 * @param {Cache<TemplateStringsArray, TemplateStringsArray>} templateCache
 * @param {Cache<string, string>} tagsCache
 * @returns {ReadonlyArray}
 */
const transformArray = (items, scopedElements, templateCache, tagsCache) =>
  items.map(value => {
    if (value instanceof TemplateResult) {
      return transformTemplate(value, scopedElements, templateCache, tagsCache);
    }

    if (Array.isArray(value)) {
      return transformArray(value, scopedElements, templateCache, tagsCache);
    }

    return value;
  });

/**
 * Transforms a TemplateResult into another one with resolved scoped elements
 *
 * @param {TemplateResult} template
 * @param {ScopedElementsMap} scopedElements
 * @param {Cache<TemplateStringsArray, TemplateStringsArray>} templateCache
 * @param {Cache<string, string>} tagsCache
 * @returns {TemplateResult}
 */
const transformTemplate = (template, scopedElements, templateCache, tagsCache) =>
  new TemplateResult(
    transform(template.strings, scopedElements, templateCache, tagsCache),
    transformArray(template.values, scopedElements, templateCache, tagsCache),
    template.type,
    template.processor,
  );

/**
 * Gets an instance of the ScopedElementsTemplateFactory
 *
 * @param {string} scopeName
 * @param {ScopedElementsMap} scopedElements
 * @param {Cache<TemplateStringsArray, TemplateStringsArray>} templateCache
 * @param {Cache<string, string>} tagsCache
 * @returns {function(any): any}
 */
const scopedElementsTemplateFactory = (
  scopeName,
  scopedElements,
  templateCache,
  tagsCache,
) => template => {
  const newTemplate = transformTemplate(template, scopedElements, templateCache, tagsCache);

  return shadyTemplateFactory(scopeName)(newTemplate);
};

/** @type {ScopedElementsMixin} */
const ScopedElementsMixinImplementation = superclass =>
  class ScopedElementsHost extends superclass {
    /**
     * Obtains the scoped elements definitions map
     *
     * @returns {ScopedElementsMap}
     */
    static get scopedElements() {
      return {};
    }

    /** @override */
    static render(template, container, options) {
      if (!options || typeof options !== 'object' || !options.scopeName) {
        throw new Error('The `scopeName` option is required.');
      }
      const { scopeName, eventContext } = options;

      const templateCache = getTemplateCache(eventContext);
      const tagsCache = getTagsCache(eventContext);
      const { scopedElements } = this;

      return super.render(template, container, {
        ...options,
        templateFactory: scopedElementsTemplateFactory(
          scopeName,
          scopedElements,
          templateCache,
          tagsCache,
        ),
      });
    }

    /**
     * Defines a scoped element
     *
     * @param {string} tagName
     * @param {typeof HTMLElement} klass
     */
    defineScopedElement(tagName, klass) {
      return defineScopedElement(tagName, klass, getTagsCache(this));
    }

    /**
     * Returns a scoped tag name
     *
     * @deprecated Please, use the instance method instead of the static one. This static method is not able to
     * obtain the tagName of lazy defined elements, while the instance one is.
     * @param {string} tagName
     * @returns {string|undefined}
     */
    static getScopedTagName(tagName) {
      // @ts-ignore
      const klass = this.scopedElements[tagName];

      return klass
        ? registerElement(tagName, klass, getTagsCache(this))
        : getTagsCache(this).get(tagName);
    }

    /**
     * Returns a scoped tag name
     *
     * @param {string} tagName
     * @returns {string|undefined}
     */
    getScopedTagName(tagName) {
      // @ts-ignore
      const klass = this.constructor.scopedElements[tagName];

      return klass
        ? registerElement(tagName, klass, getTagsCache(this))
        : getTagsCache(this).get(tagName);
    }
  };

const ScopedElementsMixin = dedupeMixin(ScopedElementsMixinImplementation);

/**
 * @typedef {import('../types/DisabledMixinTypes').DisabledMixin} DisabledMixin
 */

/**
 * @type {DisabledMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<import('../index').LitElement>} superclass
 */
const DisabledMixinImplementation = superclass =>
  // eslint-disable-next-line no-shadow
  class extends superclass {
    static get properties() {
      return {
        disabled: {
          type: Boolean,
          reflect: true,
        },
      };
    }

    constructor() {
      super();
      this._requestedToBeDisabled = false;
      this.__isUserSettingDisabled = true;
      this.__restoreDisabledTo = false;
      this.disabled = false;
    }

    makeRequestToBeDisabled() {
      if (this._requestedToBeDisabled === false) {
        this._requestedToBeDisabled = true;
        this.__restoreDisabledTo = this.disabled;
        this.__internalSetDisabled(true);
      }
    }

    retractRequestToBeDisabled() {
      if (this._requestedToBeDisabled === true) {
        this._requestedToBeDisabled = false;
        this.__internalSetDisabled(this.__restoreDisabledTo);
      }
    }

    /** @param {boolean} value */
    __internalSetDisabled(value) {
      this.__isUserSettingDisabled = false;
      this.disabled = value;
      this.__isUserSettingDisabled = true;
    }

    /**
     * @param {PropertyKey} name
     * @param {?} oldValue
     */
    requestUpdateInternal(name, oldValue) {
      super.requestUpdateInternal(name, oldValue);
      if (name === 'disabled') {
        if (this.__isUserSettingDisabled) {
          this.__restoreDisabledTo = this.disabled;
        }
        if (this.disabled === false && this._requestedToBeDisabled === true) {
          this.__internalSetDisabled(true);
        }
      }
    }
  };

const DisabledMixin = dedupeMixin(DisabledMixinImplementation);

/* eslint-disable class-methods-use-this */

/**
 * @typedef {import('../types/SlotMixinTypes').SlotMixin} SlotMixin
 * @typedef {import('../types/SlotMixinTypes').SlotsMap} SlotsMap
 */

/**
 * @type {SlotMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<HTMLElement>} superclass
 */
const SlotMixinImplementation = superclass =>
  // eslint-disable-next-line no-unused-vars, no-shadow
  class extends superclass {
    /**
     * @return {SlotsMap}
     */
    get slots() {
      return {};
    }

    constructor() {
      super();
      this.__privateSlots = new Set(null);
    }

    connectedCallback() {
      // @ts-ignore checking this in case we pass LitElement, found no good way to type this...
      if (super.connectedCallback) {
        // @ts-ignore checking this in case we pass LitElement, found no good way to type this...
        super.connectedCallback();
      }
      this._connectSlotMixin();
    }

    _connectSlotMixin() {
      if (!this.__isConnectedSlotMixin) {
        Object.keys(this.slots).forEach(slotName => {
          if (!this.querySelector(`[slot=${slotName}]`)) {
            const slotFactory = this.slots[slotName];
            const slotContent = slotFactory();
            // ignore non-elements to enable conditional slots
            if (slotContent instanceof Element) {
              slotContent.setAttribute('slot', slotName);
              this.appendChild(slotContent);
              this.__privateSlots.add(slotName);
            }
          }
        });
        this.__isConnectedSlotMixin = true;
      }
    }

    /**
     * @param {string} slotName Name of the slot
     * @return {boolean} true if given slot name been created by SlotMixin
     */
    _isPrivateSlot(slotName) {
      return this.__privateSlots.has(slotName);
    }
  };

const SlotMixin = dedupeMixin(SlotMixinImplementation);

/**
 * From https://stackoverflow.com/questions/4565112/javascript-how-to-find-out-if-the-user-browser-is-chrome
 * @param {string} [flavor]
 */
function checkChrome(flavor = 'google-chrome') {
  // @ts-ignore
  const isChromium = window.chrome;
  if (flavor === 'chromium') {
    return isChromium;
  }
  const winNav = window.navigator;
  const vendorName = winNav.vendor;
  // @ts-ignore
  const isOpera = typeof window.opr !== 'undefined';
  const isIEedge = winNav.userAgent.indexOf('Edge') > -1;
  const isIOSChrome = winNav.userAgent.match('CriOS');

  if (flavor === 'ios') {
    return isIOSChrome;
  }

  if (flavor === 'google-chrome') {
    return (
      isChromium !== null &&
      typeof isChromium !== 'undefined' &&
      vendorName === 'Google Inc.' &&
      isOpera === false &&
      isIEedge === false
    );
  }

  return undefined;
}

const browserDetection = {
  isIE11: /Trident/.test(window.navigator.userAgent),
  isChrome: checkChrome(),
  isIOSChrome: checkChrome('ios'),
  isChromium: checkChrome('chromium'),
  isMac: navigator.appVersion.indexOf('Mac') !== -1,
};

class EventTargetShim {
  constructor() {
    const delegate = document.createDocumentFragment();

    /**
     *
     * @param {string} type
     * @param {EventListener} listener
     * @param {Object} [opts]
     */
    const delegatedAddEventListener = (type, listener, opts) =>
      delegate.addEventListener(type, listener, opts);

    /**
     * @param {string} type
     * @param {EventListener} listener
     * @param {Object} [opts]
     */
    const delegatedRemoveEventListener = (type, listener, opts) =>
      delegate.removeEventListener(type, listener, opts);

    /**
     * @param {Event|CustomEvent} event
     */
    const delegatedDispatchEvent = event => delegate.dispatchEvent(event);

    this.addEventListener = delegatedAddEventListener;

    this.removeEventListener = delegatedRemoveEventListener;

    this.dispatchEvent = delegatedDispatchEvent;
  }
}

/**
 * @typedef {import('../../types/registration/FormRegisteringMixinTypes').FormRegisteringMixin} FormRegisteringMixin
 * @typedef {import('../../types/registration/FormRegistrarMixinTypes').ElementWithParentFormGroup} ElementWithParentFormGroup
 * @typedef {import('../../types/registration/FormRegistrarMixinTypes').FormRegistrarHost} FormRegistrarHost
 */

/**
 * #FormRegisteringMixin:
 *
 * This Mixin registers a form element to a Registrar
 *
 * @type {FormRegisteringMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<HTMLElement>} superclass
 */
const FormRegisteringMixinImplementation = superclass =>
  class extends superclass {
    constructor() {
      super();
      /** @type {FormRegistrarHost | undefined} */
      this._parentFormGroup = undefined;
    }

    connectedCallback() {
      // @ts-expect-error check it anyway, because could be lit-element extension
      if (super.connectedCallback) {
        // @ts-expect-error check it anyway, because could be lit-element extension
        super.connectedCallback();
      }
      this.dispatchEvent(
        new CustomEvent('form-element-register', {
          detail: { element: this },
          bubbles: true,
        }),
      );
    }

    disconnectedCallback() {
      // @ts-expect-error check it anyway, because could be lit-element extension
      if (super.disconnectedCallback) {
        // @ts-expect-error check it anyway, because could be lit-element extension
        super.disconnectedCallback();
      }
      if (this._parentFormGroup) {
        this._parentFormGroup.removeFormElement(this);
      }
    }
  };

const FormRegisteringMixin = dedupeMixin(FormRegisteringMixinImplementation);

/* eslint-disable no-bitwise */

const moveDownConditions = [
  Node.DOCUMENT_POSITION_PRECEDING,
  Node.DOCUMENT_POSITION_CONTAINS,
  Node.DOCUMENT_POSITION_CONTAINS | Node.DOCUMENT_POSITION_PRECEDING,
];

/**
 * @desc Let the order of adding ids to aria element by DOM order, so that the screen reader
 * respects visual order when reading:
 * https://developers.google.com/web/fundamentals/accessibility/focus/dom-order-matters
 * @param {HTMLElement[]} descriptionElements - holds references to description or label elements whose
 * id should be returned
 * @param {Object} opts
 * @param {boolean} [opts.reverse]
 * @returns {HTMLElement[]} sorted set of elements based on dom order
 */
function getAriaElementsInRightDomOrder(descriptionElements, { reverse } = {}) {
  /**
   * @param {HTMLElement} a
   * @param {HTMLElement} b
   * @return {-1|1}
   */
  const putPrecedingSiblingsAndLocalParentsFirst = (a, b) => {
    // https://developer.mozilla.org/en-US/docs/Web/API/Node/compareDocumentPosition
    const pos = a.compareDocumentPosition(b);

    // Unfortunately, for IE, we have to switch the order (?)
    if (moveDownConditions.includes(pos)) {
      return browserDetection.isIE11 ? -1 : 1;
    }
    return browserDetection.isIE11 ? 1 : -1;
  };

  const descriptionEls = descriptionElements.filter(el => el); // filter out null references
  descriptionEls.sort(putPrecedingSiblingsAndLocalParentsFirst);
  if (reverse) {
    descriptionEls.reverse();
  }
  return descriptionEls;
}

/**
 * A modelValue can demand a certain type (Date, Number, Iban etc.). A correct type will always be
 * translatable into a String representation (the value presented to the end user) via the
 * `formatter`. When the type is not valid (usually as a consequence of a user typing in an invalid
 * or incomplete viewValue), the current truth is captured in the `Unparseable` type.
 * For example: a viewValue can't be parsed (for instance 'foo' when the type should be Number).

 * The model(value) concept as implemented in lion-web is conceptually comparable to those found in
 * popular frameworks like Angular and Vue.

 * The Unparseable type is an addition on top of this that mainly is added for the following two
 * purposes:
 * - restoring user sessions
 * - realtime updated with all value changes
 */
class Unparseable {
  /** @param {string} value */
  constructor(value) {
    this.type = 'unparseable';
    this.viewValue = value;
  }

  toString() {
    return JSON.stringify({ type: this.type, viewValue: this.viewValue });
  }
}

/**
 * @typedef {import('@lion/core').TemplateResult} TemplateResult
 * @typedef {import('@lion/core').CSSResult} CSSResult
 * @typedef {import('@lion/core').nothing} nothing
 * @typedef {import('@lion/core/types/SlotMixinTypes').SlotsMap} SlotsMap
 * @typedef {import('../types/FormControlMixinTypes.js').FormControlMixin} FormControlMixin
 * @typedef {import('../types/FormControlMixinTypes.js').ModelValueEventDetails} ModelValueEventDetails
 */

/**
 * Generates random unique identifier (for dom elements)
 * @param {string} prefix
 */
function uuid(prefix) {
  return `${prefix}-${Math.random().toString(36).substr(2, 10)}`;
}

/**
 * #FormControlMixin :
 *
 * This Mixin is a shared fundament for all form components, it's applied on:
 * - LionField (which is extended to LionInput, LionTextarea, LionSelect etc. etc.)
 * - LionFieldset (which is extended to LionRadioGroup, LionCheckboxGroup, LionForm)
 * @param {import('@open-wc/dedupe-mixin').Constructor<import('@lion/core').LitElement>} superclass
 * @type {FormControlMixin}
 */
const FormControlMixinImplementation = superclass =>
  // eslint-disable-next-line no-shadow, no-unused-vars
  class FormControlMixin extends FormRegisteringMixin(DisabledMixin(SlotMixin(superclass))) {
    /** @type {any} */
    static get properties() {
      return {
        /**
         * The name the element will be registered on to the .formElements collection
         * of the parent.
         */
        name: {
          type: String,
          reflect: true,
        },
        /**
         * A Boolean attribute which, if present, indicates that the user should not be able to edit
         * the value of the input. The difference between disabled and readonly is that read-only
         * controls can still function, whereas disabled controls generally do not function as
         * controls until they are enabled.
         *
         * (From: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#attr-readonly)
         */
        readOnly: {
          type: Boolean,
          attribute: 'readonly',
          reflect: true,
        },
        /**
         * The label text for the input node.
         * When no light dom defined via [slot=label], this value will be used
         */
        label: String, // FIXME: { attribute: false } breaks a bunch of tests, but shouldn't...
        /**
         * The helpt text for the input node.
         * When no light dom defined via [slot=help-text], this value will be used
         */
        helpText: {
          type: String,
          attribute: 'help-text',
        },

        /**
         * The model value is the result of the parser function(when available).
         * It should be considered as the internal value used for validation and reasoning/logic.
         * The model value is 'ready for consumption' by the outside world (think of a Date
         * object or a float). The modelValue can(and is recommended to) be used as both input
         * value and output value of the `LionField`.
         *
         * Examples:
         * - For a date input: a String '20/01/1999' will be converted to new Date('1999/01/20')
         * - For a number input: a formatted String '1.234,56' will be converted to a Number:
         *   1234.56
         */
        modelValue: { attribute: false },

        /**
         * Contains all elements that should end up in aria-labelledby of `._inputNode`
         */
        _ariaLabelledNodes: { attribute: false },
        /**
         * Contains all elements that should end up in aria-describedby of `._inputNode`
         */
        _ariaDescribedNodes: { attribute: false },
        /**
         * Based on the role, details of handling model-value-changed repropagation differ.
         */
        _repropagationRole: { attribute: false },
        /**
         * By default, a field with _repropagationRole 'choice-group' will act as an
         * 'endpoint'. This means it will be considered as an individual field: for
         * a select, individual options will not be part of the formPath. They
         * will.
         * Similarly, components that (a11y wise) need to be fieldsets, but 'interaction wise'
         * (from Application Developer perspective) need to be more like fields
         * (think of an amount-input with a currency select box next to it), can set this
         * to true to hide private internals in the formPath.
         */
        _isRepropagationEndpoint: { attribute: false },
      };
    }

    /**
     * @return {string}
     */
    get label() {
      return this.__label || (this._labelNode && this._labelNode.textContent) || '';
    }

    /**
     * @param {string} newValue
     */
    set label(newValue) {
      const oldValue = this.label;
      /** @type {string} */
      this.__label = newValue;
      this.requestUpdate('label', oldValue);
    }

    /**
     * @return {string}
     */
    get helpText() {
      return this.__helpText || (this._helpTextNode && this._helpTextNode.textContent) || '';
    }

    /**
     * @param {string} newValue
     */
    set helpText(newValue) {
      const oldValue = this.helpText;
      /** @type {string} */
      this.__helpText = newValue;
      this.requestUpdate('helpText', oldValue);
    }

    /**
     * @return {string}
     */
    get fieldName() {
      return this.__fieldName || this.label || this.name || '';
    }

    /**
     * @param {string} value
     */
    set fieldName(value) {
      /** @type {string} */
      this.__fieldName = value;
    }

    /**
     * @return {SlotsMap}
     */
    get slots() {
      return {
        ...super.slots,
        label: () => {
          const label = document.createElement('label');
          label.textContent = this.label;
          return label;
        },
        'help-text': () => {
          const helpText = document.createElement('div');
          helpText.textContent = this.helpText;
          return helpText;
        },
      };
    }

    get _inputNode() {
      return this.__getDirectSlotChild('input');
    }

    get _labelNode() {
      return this.__getDirectSlotChild('label');
    }

    get _helpTextNode() {
      return this.__getDirectSlotChild('help-text');
    }

    get _feedbackNode() {
      return /** @type {import('./validate/LionValidationFeedback').LionValidationFeedback | undefined} */ (this.__getDirectSlotChild(
        'feedback',
      ));
    }

    constructor() {
      super();
      /** @type {string | undefined} */
      this.name = undefined;
      /** @type {string} */
      this._inputId = uuid(this.localName);
      /** @type {HTMLElement[]} */
      this._ariaLabelledNodes = [];
      /** @type {HTMLElement[]} */
      this._ariaDescribedNodes = [];
      /** @type {'child'|'choice-group'|'fieldset'} */
      this._repropagationRole = 'child';
      this._isRepropagationEndpoint = false;
      this.addEventListener(
        'model-value-changed',
        /** @type {EventListenerOrEventListenerObject} */ (this.__repropagateChildrenValues),
      );
      /** @type {EventListener} */
      this._onLabelClick = this._onLabelClick.bind(this);
    }

    connectedCallback() {
      super.connectedCallback();
      this._enhanceLightDomClasses();
      this._enhanceLightDomA11y();
      this._triggerInitialModelValueChangedEvent();

      if (this._labelNode) {
        this._labelNode.addEventListener('click', this._onLabelClick);
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      if (this._labelNode) {
        this._labelNode.removeEventListener('click', this._onLabelClick);
      }
    }

    /** @param {import('@lion/core').PropertyValues } changedProperties */
    updated(changedProperties) {
      super.updated(changedProperties);

      if (changedProperties.has('_ariaLabelledNodes')) {
        this.__reflectAriaAttr(
          'aria-labelledby',
          this._ariaLabelledNodes,
          this.__reorderAriaLabelledNodes,
        );
      }

      if (changedProperties.has('_ariaDescribedNodes')) {
        this.__reflectAriaAttr(
          'aria-describedby',
          this._ariaDescribedNodes,
          this.__reorderAriaDescribedNodes,
        );
      }

      if (changedProperties.has('label') && this._labelNode) {
        this._labelNode.textContent = this.label;
      }

      if (changedProperties.has('helpText') && this._helpTextNode) {
        this._helpTextNode.textContent = this.helpText;
      }

      if (changedProperties.has('name')) {
        this.dispatchEvent(
          new CustomEvent('form-element-name-changed', {
            detail: { oldName: changedProperties.get('name'), newName: this.name },
            bubbles: true,
          }),
        );
      }
    }

    _triggerInitialModelValueChangedEvent() {
      this.__dispatchInitialModelValueChangedEvent();
    }

    _enhanceLightDomClasses() {
      if (this._inputNode) {
        this._inputNode.classList.add('form-control');
      }
    }

    _enhanceLightDomA11y() {
      const { _inputNode, _labelNode, _helpTextNode, _feedbackNode } = this;

      if (_inputNode) {
        _inputNode.id = _inputNode.id || this._inputId;
      }
      if (_labelNode) {
        _labelNode.setAttribute('for', this._inputId);
        this.addToAriaLabelledBy(_labelNode, { idPrefix: 'label' });
      }
      if (_helpTextNode) {
        this.addToAriaDescribedBy(_helpTextNode, { idPrefix: 'help-text' });
      }
      if (_feedbackNode) {
        _feedbackNode.setAttribute('aria-live', 'polite');
        this.addToAriaDescribedBy(_feedbackNode, { idPrefix: 'feedback' });
      }
      this._enhanceLightDomA11yForAdditionalSlots();
    }

    /**
     * Enhances additional slots(prefix, suffix, before, after) defined by developer.
     *
     * When boolean attribute data-label or data-description is found,
     * the slot element will be connected to the input via aria-labelledby or aria-describedby
     * @param {string[]} additionalSlots
     */
    _enhanceLightDomA11yForAdditionalSlots(
      additionalSlots = ['prefix', 'suffix', 'before', 'after'],
    ) {
      additionalSlots.forEach(additionalSlot => {
        const element = this.__getDirectSlotChild(additionalSlot);
        if (element) {
          if (element.hasAttribute('data-label') === true) {
            this.addToAriaLabelledBy(element, { idPrefix: additionalSlot });
          }
          if (element.hasAttribute('data-description') === true) {
            this.addToAriaDescribedBy(element, { idPrefix: additionalSlot });
          }
        }
      });
    }

    /**
     * Will handle help text, validation feedback and character counter,
     * prefix/suffix/before/after (if they contain data-description flag attr).
     * Also, contents of id references that will be put in the <lion-field>._ariaDescribedby property
     * from an external context, will be read by a screen reader.
     * @param {string} attrName
     * @param {HTMLElement[]} nodes
     * @param {boolean|undefined} reorder
     */
    __reflectAriaAttr(attrName, nodes, reorder) {
      if (this._inputNode) {
        if (reorder) {
          const insideNodes = nodes.filter(n => this.contains(n));
          const outsideNodes = nodes.filter(n => !this.contains(n));
          // eslint-disable-next-line no-param-reassign
          nodes = [...getAriaElementsInRightDomOrder(insideNodes), ...outsideNodes];
        }
        const string = nodes.map(n => n.id).join(' ');
        this._inputNode.setAttribute(attrName, string);
      }
    }

    /**
     * Default Render Result:
     * <div class="form-field__group-one">
     *   <div class="form-field__label">
     *     <slot name="label"></slot>
     *   </div>
     *   <small class="form-field__help-text">
     *     <slot name="help-text"></slot>
     *   </small>
     * </div>
     * <div class="form-field__group-two">
     *   <div class="input-group">
     *     <div class="input-group__before">
     *       <slot name="before"></slot>
     *     </div>
     *     <div class="input-group__container">
     *       <div class="input-group__prefix">
     *         <slot name="prefix"></slot>
     *       </div>
     *       <div class="input-group__input">
     *         <slot name="input"></slot>
     *       </div>
     *       <div class="input-group__suffix">
     *         <slot name="suffix"></slot>
     *       </div>
     *     </div>
     *     <div class="input-group__after">
     *       <slot name="after"></slot>
     *     </div>
     *   </div>
     *   <div class="form-field__feedback">
     *     <slot name="feedback"></slot>
     *   </div>
     * </div>
     */
    render() {
      return html`
        <div class="form-field__group-one">${this._groupOneTemplate()}</div>
        <div class="form-field__group-two">${this._groupTwoTemplate()}</div>
      `;
    }

    /**
     * @return {TemplateResult}
     */
    _groupOneTemplate() {
      return html` ${this._labelTemplate()} ${this._helpTextTemplate()} `;
    }

    /**
     * @return {TemplateResult}
     */
    _groupTwoTemplate() {
      return html` ${this._inputGroupTemplate()} ${this._feedbackTemplate()} `;
    }

    /**
     * @return {TemplateResult}
     */
    // eslint-disable-next-line class-methods-use-this
    _labelTemplate() {
      return html`
        <div class="form-field__label">
          <slot name="label"></slot>
        </div>
      `;
    }

    /**
     * @return {TemplateResult}
     */
    // eslint-disable-next-line class-methods-use-this
    _helpTextTemplate() {
      return html`
        <small class="form-field__help-text">
          <slot name="help-text"></slot>
        </small>
      `;
    }

    /**
     * @return {TemplateResult}
     */
    _inputGroupTemplate() {
      return html`
        <div class="input-group">
          ${this._inputGroupBeforeTemplate()}
          <div class="input-group__container">
            ${this._inputGroupPrefixTemplate()} ${this._inputGroupInputTemplate()}
            ${this._inputGroupSuffixTemplate()}
          </div>
          ${this._inputGroupAfterTemplate()}
        </div>
      `;
    }

    /**
     * @return {TemplateResult}
     */
    // eslint-disable-next-line class-methods-use-this
    _inputGroupBeforeTemplate() {
      return html`
        <div class="input-group__before">
          <slot name="before"></slot>
        </div>
      `;
    }

    /**
     * @return {TemplateResult | nothing}
     */
    _inputGroupPrefixTemplate() {
      return !Array.from(this.children).find(child => child.slot === 'prefix')
        ? nothing
        : html`
            <div class="input-group__prefix">
              <slot name="prefix"></slot>
            </div>
          `;
    }

    /**
     * @return {TemplateResult}
     */
    // eslint-disable-next-line class-methods-use-this
    _inputGroupInputTemplate() {
      return html`
        <div class="input-group__input">
          <slot name="input"></slot>
        </div>
      `;
    }

    /**
     * @return {TemplateResult | nothing}
     */
    _inputGroupSuffixTemplate() {
      return !Array.from(this.children).find(child => child.slot === 'suffix')
        ? nothing
        : html`
            <div class="input-group__suffix">
              <slot name="suffix"></slot>
            </div>
          `;
    }

    /**
     * @return {TemplateResult}
     */
    // eslint-disable-next-line class-methods-use-this
    _inputGroupAfterTemplate() {
      return html`
        <div class="input-group__after">
          <slot name="after"></slot>
        </div>
      `;
    }

    /**
     * @return {TemplateResult}
     */
    // eslint-disable-next-line class-methods-use-this
    _feedbackTemplate() {
      return html`
        <div class="form-field__feedback">
          <slot name="feedback"></slot>
        </div>
      `;
    }

    /**
     * @param {?} modelValue
     * @return {boolean}
     */
    // @ts-ignore FIXME: Move to FormatMixin? Since there we have access to modelValue prop
    _isEmpty(modelValue = this.modelValue) {
      let value = modelValue;
      // @ts-ignore
      if (this.modelValue instanceof Unparseable) {
        // @ts-ignore
        value = this.modelValue.viewValue;
      }

      // Checks for empty platform types: Objects, Arrays, Dates
      if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        return !Object.keys(value).length;
      }

      // eslint-disable-next-line no-mixed-operators
      // Checks for empty platform types: Numbers, Booleans
      const isNumberValue = typeof value === 'number' && (value === 0 || Number.isNaN(value));
      const isBooleanValue = typeof value === 'boolean' && value === false;

      return !value && !isNumberValue && !isBooleanValue;
    }

    /**
     * All CSS below is written from a generic mindset, following BEM conventions:
     * https://en.bem.info/methodology/
     * Although the CSS and HTML are implemented by the component, they should be regarded as
     * totally decoupled.
     *
     * Not only does this force us to write better structured css, it also allows for future
     * reusability in many different ways like:
     *  - disabling shadow DOM for a component (for water proof encapsulation can be combined with
     *    a build step)
     *  - easier translation to more flexible, WebComponents agnostic solutions like JSS
     *    (allowing extends, mixins, reasoning, IDE integration, tree shaking etc.)
     *  - export to a CSS module for reuse in an outer context
     *
     *
     * Please note that the HTML structure is purposely 'loose', allowing multiple design systems
     * to be compatible
     * with the CSS component.
     * Note that every occurence of '::slotted(*)' can be rewritten to '> *' for use in an other
     * context
     */

    /**
     * {block} .form-field
     *
     * Structure:
     * - {element}  .form-field__label : a wrapper element around the projected label
     * - {element}  .form-field__help-text (optional) : a wrapper element around the projected
     *               help-text
     * - {block}    .input-group : a container around the input element, including prefixes and
     *               suffixes
     * - {element}  .form-field__feedback (optional) : a wrapper element around the projected
     *               (validation) feedback message
     *
     * Modifiers:
     * - {state} [disabled] when .form-control (<input>, <textarea> etc.) has disabled set
     *            to true
     * - {state} [filled] whether <input> has a value
     * - {state} [touched] whether the user had blurred the field once
     * - {state} [dirty] whether the value has changed since initial value
     *
     * TODO: update states below
     * These classes are now attributes. Check them agains the new attribute names inside ValidateMixin
     * and InteractionStateMixin. Some states got renamed. Make sure to use the correct ones!
     * - {state} .state-focused: when .form-control (<input>, <textarea> etc.) <input> has focus
     * - {state} .state-invalid: when input has error(s) (regardless of whether they should be
     *            shown to the user)
     * - {state} .state-error: when input has error(s) and this/these should be shown to the user
     * - {state} .state-warning: when input has warning(s) and this/these should be shown to the
     *            user
     * - {state} .state-info: when input has info feedback message(s) and this/these should be shown
     *            to the user
     * - {state} .state-success: when input has success feedback message(s) and this/these should be
     *            shown to the user
     */

    /**
     * {block} .input-group
     *
     * Structure:
     * - {element} .input-group__before (optional) : a prefix that resides outside the container
     * - {element} .input-group__container : an inner container: this element contains all styling
     *  - {element} .input-group__prefix (optional) : a prefix that resides in the container,
     *               allowing it to be detectable as a :first-child
     *  - {element} .input-group__input : a wrapper around the form-control component
     *   - {block} .form-control : the actual input element (input/select/textarea)
     *  - {element} .input-group__suffix (optional) : a suffix that resides inside the container,
     *               allowing it to be detectable as a :last-child
     *  - {element} .input-group__bottom (optional) : placeholder element for additional styling
     *               (like an animated line for material design input)
     * - {element} .input-group__after (optional) :  a suffix that resides outside the container
     */
    static get styles() {
      return [
        super.styles || [],
        css`
          /**********************
            {block} .form-field
           ********************/

          :host {
            display: block;
          }

          :host([hidden]) {
            display: none;
          }

          :host([disabled]) {
            pointer-events: none;
          }

          :host([disabled]) .form-field__label ::slotted(*),
          :host([disabled]) .form-field__help-text ::slotted(*) {
            color: var(--disabled-text-color, #767676);
          }

          /***********************
            {block} .input-group
           *********************/

          .input-group__container {
            display: flex;
          }

          .input-group__input {
            flex: 1;
            display: flex;
          }

          /***** {state} :disabled *****/
          :host([disabled]) .input-group ::slotted(slot='input') {
            color: var(--disabled-text-color, #767676);
          }

          /***********************
            {block} .form-control
           **********************/

          .input-group__container > .input-group__input ::slotted(.form-control) {
            flex: 1 1 auto;
            margin: 0; /* remove input margin in Safari */
            font-size: 100%; /* normalize default input font-size */
          }
        `,
      ];
    }

    /**
     * @return {Array.<HTMLElement|undefined>}
     */
    // Returns dom references to all elements that should be referred to by field(s)
    _getAriaDescriptionElements() {
      return [this._helpTextNode, this._feedbackNode];
    }

    /**
     * Meant for Application Developers wanting to add to aria-labelledby attribute.
     * @param {HTMLElement} element
     * @param {{idPrefix?:string; reorder?: boolean}} customConfig
     */
    addToAriaLabelledBy(element, customConfig = {}) {
      const { idPrefix, reorder } = {
        reorder: true,
        ...customConfig,
      };

      // eslint-disable-next-line no-param-reassign
      element.id = element.id || `${idPrefix}-${this._inputId}`;
      if (!this._ariaLabelledNodes.includes(element)) {
        this._ariaLabelledNodes = [...this._ariaLabelledNodes, element];
        // This value will be read when we need to reflect to attr
        /** @type {boolean} */
        this.__reorderAriaLabelledNodes = Boolean(reorder);
      }
    }

    /**
     * Meant for Application Developers wanting to add to aria-describedby attribute.
     * @param {HTMLElement} element
     * @param {{idPrefix?:string; reorder?: boolean}} customConfig
     */
    addToAriaDescribedBy(element, customConfig = {}) {
      const { idPrefix, reorder } = {
        // chronologically sorts children of host element('this')
        reorder: true,
        ...customConfig,
      };

      // eslint-disable-next-line no-param-reassign
      element.id = element.id || `${idPrefix}-${this._inputId}`;
      if (!this._ariaDescribedNodes.includes(element)) {
        this._ariaDescribedNodes = [...this._ariaDescribedNodes, element];
        // This value will be read when we need to reflect to attr
        /** @type {boolean} */
        this.__reorderAriaDescribedNodes = Boolean(reorder);
      }
    }

    /**
     * @param {string} slotName
     * @return {HTMLElement | undefined}
     */
    __getDirectSlotChild(slotName) {
      return /** @type {HTMLElement[]} */ (Array.from(this.children)).find(
        el => el.slot === slotName,
      );
    }

    __dispatchInitialModelValueChangedEvent() {
      // When we are not a fieldset / choice-group, we don't need to wait for our children
      // to send a unified event
      if (this._repropagationRole === 'child') {
        return;
      }

      // Initially we don't repropagate model-value-changed events coming
      // from children. On firstUpdated we re-dispatch this event to maintain
      // 'count consistency' (to not confuse the application developer with a
      // large number of initial events). Initially the source field will not
      // be part of the formPath but afterwards it will.
      /** @type {boolean} */
      this.__repropagateChildrenInitialized = true;
      this.dispatchEvent(
        new CustomEvent('model-value-changed', {
          bubbles: true,
          detail: /** @type {ModelValueEventDetails} */ ({
            formPath: [this],
            initialize: true,
            isTriggeredByUser: false,
          }),
        }),
      );
    }

    /**
     * @param {CustomEvent} ev
     */
    // eslint-disable-next-line class-methods-use-this, no-unused-vars
    _onBeforeRepropagateChildrenValues(ev) {}

    /**
     * @param {CustomEvent} ev
     */
    __repropagateChildrenValues(ev) {
      // Allows sub classes to internally listen to the children change events
      // (before stopImmediatePropagation is called below).
      this._onBeforeRepropagateChildrenValues(ev);
      // Normalize target, we also might get it from 'portals' (rich select)
      const target = (ev.detail && ev.detail.element) || ev.target;
      const isEndpoint =
        this._isRepropagationEndpoint || this._repropagationRole === 'choice-group';

      // Prevent eternal loops after we sent the event below.
      if (target === this) {
        return;
      }

      // A. Stop sibling handlers
      //
      // Make sure our sibling event listeners (added by Application developers) will not get
      // the child model-value-changed event, but the repropagated one at the bottom of this
      // method
      ev.stopImmediatePropagation();

      // B1. Are we still initializing? If so, halt...
      //
      // Stop repropagating children events before firstUpdated and make sure we de not
      // repropagate init events of our children (we already sent our own
      // initial model-value-change event in firstUpdated)
      const isGroup = this._repropagationRole !== 'child'; // => fieldset or choice-group
      const isSelfInitializing = isGroup && !this.__repropagateChildrenInitialized;
      const isChildGroupInitializing = ev.detail && ev.detail.initialize;
      if (isSelfInitializing || isChildGroupInitializing) {
        return;
      }

      // B2. Are we a single choice choice-group? If so, halt when target unchecked
      // and something else is checked, meaning we will get
      // another model-value-changed dispatch for the checked target
      //
      // We only send the checked changed up (not the unchecked). In this way a choice group
      // (radio-group, checkbox-group, select/listbox) acts as an 'endpoint' (a single Field)
      // just like the native <select>
      if (!this._repropagationCondition(target)) {
        return;
      }

      // C1. We are ready to dispatch. Create a formPath
      //
      // Compute the formPath. Choice groups are regarded 'end points'
      let parentFormPath = [];
      if (!isEndpoint) {
        parentFormPath = (ev.detail && ev.detail.formPath) || [target];
      }
      const formPath = [...parentFormPath, this];

      // C2. Finally, redispatch a fresh model-value-changed event from our host, consumable
      // for an Application Developer
      //
      // Since for a11y everything needs to be in lightdom, we don't add 'composed:true'
      this.dispatchEvent(
        new CustomEvent('model-value-changed', {
          bubbles: true,
          detail: /** @type {ModelValueEventDetails} */ ({
            formPath,
            isTriggeredByUser: Boolean(ev.detail?.isTriggeredByUser),
          }),
        }),
      );
    }

    /**
     * TODO: Extend this in choice group so that target is always a choice input and multipleChoice exists.
     * This will fix the types and reduce the need for ignores/expect-errors
     * @param {EventTarget & import('../types/choice-group/ChoiceInputMixinTypes').ChoiceInputHost} target
     */
    _repropagationCondition(target) {
      return !(
        this._repropagationRole === 'choice-group' &&
        // @ts-expect-error multipleChoice is not directly available but only as side effect
        !this.multipleChoice &&
        !target.checked
      );
    }

    /**
     * @overridable
     * A Subclasser should only override this method if the interactive element
     * ([slot=input]) is not a native element(like input, textarea, select)
     * that already receives focus on label click.
     *
     * @example
     * _onLabelClick() {
     *   this._invokerNode.focus();
     * }
     */
    // eslint-disable-next-line class-methods-use-this
    _onLabelClick() {}
  };

const FormControlMixin = dedupeMixin(FormControlMixinImplementation);

/**
 * @typedef {import('../types/FocusMixinTypes').FocusMixin} FocusMixin
 * @type {FocusMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<import('@lion/core').LitElement>} superclass
 */
const FocusMixinImplementation = superclass =>
  class FocusMixin extends FormControlMixin(superclass) {
    /** @type {any} */
    static get properties() {
      return {
        focused: {
          type: Boolean,
          reflect: true,
        },
      };
    }

    constructor() {
      super();
      this.focused = false;
    }

    connectedCallback() {
      super.connectedCallback();
      this.__registerEventsForFocusMixin();
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this.__teardownEventsForFocusMixin();
    }

    focus() {
      const native = this._inputNode;
      if (native) {
        native.focus();
      }
    }

    blur() {
      const native = this._inputNode;
      if (native) {
        native.blur();
      }
    }

    __onFocus() {
      this.focused = true;
    }

    __onBlur() {
      this.focused = false;
    }

    __registerEventsForFocusMixin() {
      /**
       * focus
       * @param {Event} ev
       */
      this.__redispatchFocus = ev => {
        ev.stopPropagation();
        this.dispatchEvent(new Event('focus'));
      };
      this._inputNode.addEventListener('focus', this.__redispatchFocus);

      /**
       * blur
       * @param {Event} ev
       */
      this.__redispatchBlur = ev => {
        ev.stopPropagation();
        this.dispatchEvent(new Event('blur'));
      };
      this._inputNode.addEventListener('blur', this.__redispatchBlur);

      /**
       * focusin
       * @param {Event} ev
       */
      this.__redispatchFocusin = ev => {
        ev.stopPropagation();
        this.__onFocus();
        this.dispatchEvent(new Event('focusin', { bubbles: true, composed: true }));
      };
      this._inputNode.addEventListener('focusin', this.__redispatchFocusin);

      /**
       * focusout
       * @param {Event} ev
       */
      this.__redispatchFocusout = ev => {
        ev.stopPropagation();
        this.__onBlur();
        this.dispatchEvent(new Event('focusout', { bubbles: true, composed: true }));
      };
      this._inputNode.addEventListener('focusout', this.__redispatchFocusout);
    }

    __teardownEventsForFocusMixin() {
      this._inputNode.removeEventListener(
        'focus',
        /** @type {EventListenerOrEventListenerObject} */ (this.__redispatchFocus),
      );
      this._inputNode.removeEventListener(
        'blur',
        /** @type {EventListenerOrEventListenerObject} */ (this.__redispatchBlur),
      );
      this._inputNode.removeEventListener(
        'focusin',
        /** @type {EventListenerOrEventListenerObject} */ (this.__redispatchFocusin),
      );
      this._inputNode.removeEventListener(
        'focusout',
        /** @type {EventListenerOrEventListenerObject} */ (this.__redispatchFocusout),
      );
    }
  };

const FocusMixin = dedupeMixin(FocusMixinImplementation);

const sym = Symbol.for('lion::SingletonManagerClassStorage');

class SingletonManagerClass {
  constructor() {
    this._map = window[sym] ? window[sym] : (window[sym] = new Map());
  }

  /**
   * Ignores already existing keys (e.g. it will not override)
   *
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    if (!this.has(key)) {
      this._map.set(key, value);
    }
  }

  /**
   * @param {string} key
   * @returns
   */
  get(key) {
    return this._map.get(key);
  }

  /**
   * @param {string} key
   */
  has(key) {
    return this._map.has(key);
  }
}

const singletonManager = new SingletonManagerClass();

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

// @flow
var LONG = 'long';
var SHORT = 'short';
var NARROW = 'narrow';
var NUMERIC = 'numeric';
var TWODIGIT = '2-digit';

/**
 * formatting information
 **/
var formatMessageFormats = {
  number: {
    decimal: {
      style: 'decimal'
    },
    integer: {
      style: 'decimal',
      maximumFractionDigits: 0
    },
    currency: {
      style: 'currency',
      currency: 'USD'
    },
    percent: {
      style: 'percent'
    },
    default: {
      style: 'decimal'
    }
  },
  date: {
    short: {
      month: NUMERIC,
      day: NUMERIC,
      year: TWODIGIT
    },
    medium: {
      month: SHORT,
      day: NUMERIC,
      year: NUMERIC
    },
    long: {
      month: LONG,
      day: NUMERIC,
      year: NUMERIC
    },
    full: {
      month: LONG,
      day: NUMERIC,
      year: NUMERIC,
      weekday: LONG
    },
    default: {
      month: SHORT,
      day: NUMERIC,
      year: NUMERIC
    }
  },
  time: {
    short: {
      hour: NUMERIC,
      minute: NUMERIC
    },
    medium: {
      hour: NUMERIC,
      minute: NUMERIC,
      second: NUMERIC
    },
    long: {
      hour: NUMERIC,
      minute: NUMERIC,
      second: NUMERIC,
      timeZoneName: SHORT
    },
    full: {
      hour: NUMERIC,
      minute: NUMERIC,
      second: NUMERIC,
      timeZoneName: SHORT
    },
    default: {
      hour: NUMERIC,
      minute: NUMERIC,
      second: NUMERIC
    }
  },
  duration: {
    default: {
      hours: {
        minimumIntegerDigits: 1,
        maximumFractionDigits: 0
      },
      minutes: {
        minimumIntegerDigits: 2,
        maximumFractionDigits: 0
      },
      seconds: {
        minimumIntegerDigits: 2,
        maximumFractionDigits: 3
      }
    }
  },
  parseNumberPattern: function (pattern/*: ?string */) {
    if (!pattern) return
    var options = {};
    var currency = pattern.match(/\b[A-Z]{3}\b/i);
    var syms = pattern.replace(/[^¤]/g, '').length;
    if (!syms && currency) syms = 1;
    if (syms) {
      options.style = 'currency';
      options.currencyDisplay = syms === 1 ? 'symbol' : syms === 2 ? 'code' : 'name';
      options.currency = currency ? currency[0].toUpperCase() : 'USD';
    } else if (pattern.indexOf('%') >= 0) {
      options.style = 'percent';
    }
    if (!/[@#0]/.test(pattern)) return options.style ? options : undefined
    options.useGrouping = pattern.indexOf(',') >= 0;
    if (/E\+?[@#0]+/i.test(pattern) || pattern.indexOf('@') >= 0) {
      var size = pattern.replace(/E\+?[@#0]+|[^@#0]/gi, '');
      options.minimumSignificantDigits = Math.min(Math.max(size.replace(/[^@0]/g, '').length, 1), 21);
      options.maximumSignificantDigits = Math.min(Math.max(size.length, 1), 21);
    } else {
      var parts = pattern.replace(/[^#0.]/g, '').split('.');
      var integer = parts[0];
      var n = integer.length - 1;
      while (integer[n] === '0') --n;
      options.minimumIntegerDigits = Math.min(Math.max(integer.length - 1 - n, 1), 21);
      var fraction = parts[1] || '';
      n = 0;
      while (fraction[n] === '0') ++n;
      options.minimumFractionDigits = Math.min(Math.max(n, 0), 20);
      while (fraction[n] === '#') ++n;
      options.maximumFractionDigits = Math.min(Math.max(n, 0), 20);
    }
    return options
  },
  parseDatePattern: function (pattern/*: ?string */) {
    if (!pattern) return
    var options = {};
    for (var i = 0; i < pattern.length;) {
      var current = pattern[i];
      var n = 1;
      while (pattern[++i] === current) ++n;
      switch (current) {
        case 'G':
          options.era = n === 5 ? NARROW : n === 4 ? LONG : SHORT;
          break
        case 'y':
        case 'Y':
          options.year = n === 2 ? TWODIGIT : NUMERIC;
          break
        case 'M':
        case 'L':
          n = Math.min(Math.max(n - 1, 0), 4);
          options.month = [ NUMERIC, TWODIGIT, SHORT, LONG, NARROW ][n];
          break
        case 'E':
        case 'e':
        case 'c':
          options.weekday = n === 5 ? NARROW : n === 4 ? LONG : SHORT;
          break
        case 'd':
        case 'D':
          options.day = n === 2 ? TWODIGIT : NUMERIC;
          break
        case 'h':
        case 'K':
          options.hour12 = true;
          options.hour = n === 2 ? TWODIGIT : NUMERIC;
          break
        case 'H':
        case 'k':
          options.hour12 = false;
          options.hour = n === 2 ? TWODIGIT : NUMERIC;
          break
        case 'm':
          options.minute = n === 2 ? TWODIGIT : NUMERIC;
          break
        case 's':
        case 'S':
          options.second = n === 2 ? TWODIGIT : NUMERIC;
          break
        case 'z':
        case 'Z':
        case 'v':
        case 'V':
          options.timeZoneName = n === 1 ? SHORT : LONG;
          break
      }
    }
    return Object.keys(options).length ? options : undefined
  }
};

// @flow
// "lookup" algorithm http://tools.ietf.org/html/rfc4647#section-3.4
// assumes normalized language tags, and matches in a case sensitive manner
var lookupClosestLocale = function lookupClosestLocale (locale/*: string | string[] | void */, available/*: { [string]: any } */)/*: ?string */ {
  if (typeof locale === 'string' && available[locale]) return locale
  var locales = [].concat(locale || []);
  for (var l = 0, ll = locales.length; l < ll; ++l) {
    var current = locales[l].split('-');
    while (current.length) {
      var candidate = current.join('-');
      if (available[candidate]) return candidate
      current.pop();
    }
  }
};

// @flow

/*:: export type Rule = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other' */
var zero = 'zero', one = 'one', two = 'two', few = 'few', many = 'many', other = 'other';
var f = [
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 1 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return 0 <= n && n <= 1 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var n = +s;
    return i === 0 || n === 1 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 0 ? zero
      : n === 1 ? one
      : n === 2 ? two
      : 3 <= n % 100 && n % 100 <= 10 ? few
      : 11 <= n % 100 && n % 100 <= 99 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    return i === 1 && v === 0 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n % 10 === 1 && n % 100 !== 11 ? one
      : (2 <= n % 10 && n % 10 <= 4) && (n % 100 < 12 || 14 < n % 100) ? few
      : n % 10 === 0 || (5 <= n % 10 && n % 10 <= 9) || (11 <= n % 100 && n % 100 <= 14) ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n % 10 === 1 && (n % 100 !== 11 && n % 100 !== 71 && n % 100 !== 91) ? one
      : n % 10 === 2 && (n % 100 !== 12 && n % 100 !== 72 && n % 100 !== 92) ? two
      : ((3 <= n % 10 && n % 10 <= 4) || n % 10 === 9) && ((n % 100 < 10 || 19 < n % 100) && (n % 100 < 70 || 79 < n % 100) && (n % 100 < 90 || 99 < n % 100)) ? few
      : n !== 0 && n % 1000000 === 0 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    var f = +(s + '.').split('.')[1];
    return v === 0 && i % 10 === 1 && i % 100 !== 11 || f % 10 === 1 && f % 100 !== 11 ? one
      : v === 0 && (2 <= i % 10 && i % 10 <= 4) && (i % 100 < 12 || 14 < i % 100) || (2 <= f % 10 && f % 10 <= 4) && (f % 100 < 12 || 14 < f % 100) ? few
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    return i === 1 && v === 0 ? one
      : (2 <= i && i <= 4) && v === 0 ? few
      : v !== 0 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 0 ? zero
      : n === 1 ? one
      : n === 2 ? two
      : n === 3 ? few
      : n === 6 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var t = +('' + s).replace(/^[^.]*.?|0+$/g, '');
    var n = +s;
    return n === 1 || t !== 0 && (i === 0 || i === 1) ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    var f = +(s + '.').split('.')[1];
    return v === 0 && i % 100 === 1 || f % 100 === 1 ? one
      : v === 0 && i % 100 === 2 || f % 100 === 2 ? two
      : v === 0 && (3 <= i % 100 && i % 100 <= 4) || (3 <= f % 100 && f % 100 <= 4) ? few
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    return i === 0 || i === 1 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    var f = +(s + '.').split('.')[1];
    return v === 0 && (i === 1 || i === 2 || i === 3) || v === 0 && (i % 10 !== 4 && i % 10 !== 6 && i % 10 !== 9) || v !== 0 && (f % 10 !== 4 && f % 10 !== 6 && f % 10 !== 9) ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 1 ? one
      : n === 2 ? two
      : 3 <= n && n <= 6 ? few
      : 7 <= n && n <= 10 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 1 || n === 11 ? one
      : n === 2 || n === 12 ? two
      : ((3 <= n && n <= 10) || (13 <= n && n <= 19)) ? few
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    return v === 0 && i % 10 === 1 ? one
      : v === 0 && i % 10 === 2 ? two
      : v === 0 && (i % 100 === 0 || i % 100 === 20 || i % 100 === 40 || i % 100 === 60 || i % 100 === 80) ? few
      : v !== 0 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    var n = +s;
    return i === 1 && v === 0 ? one
      : i === 2 && v === 0 ? two
      : v === 0 && (n < 0 || 10 < n) && n % 10 === 0 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var t = +('' + s).replace(/^[^.]*.?|0+$/g, '');
    return t === 0 && i % 10 === 1 && i % 100 !== 11 || t !== 0 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 1 ? one
      : n === 2 ? two
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 0 ? zero
      : n === 1 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var n = +s;
    return n === 0 ? zero
      : (i === 0 || i === 1) && n !== 0 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var f = +(s + '.').split('.')[1];
    var n = +s;
    return n % 10 === 1 && (n % 100 < 11 || 19 < n % 100) ? one
      : (2 <= n % 10 && n % 10 <= 9) && (n % 100 < 11 || 19 < n % 100) ? few
      : f !== 0 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var v = (s + '.').split('.')[1].length;
    var f = +(s + '.').split('.')[1];
    var n = +s;
    return n % 10 === 0 || (11 <= n % 100 && n % 100 <= 19) || v === 2 && (11 <= f % 100 && f % 100 <= 19) ? zero
      : n % 10 === 1 && n % 100 !== 11 || v === 2 && f % 10 === 1 && f % 100 !== 11 || v !== 2 && f % 10 === 1 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    var f = +(s + '.').split('.')[1];
    return v === 0 && i % 10 === 1 && i % 100 !== 11 || f % 10 === 1 && f % 100 !== 11 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    var n = +s;
    return i === 1 && v === 0 ? one
      : v !== 0 || n === 0 || n !== 1 && (1 <= n % 100 && n % 100 <= 19) ? few
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 1 ? one
      : n === 0 || (2 <= n % 100 && n % 100 <= 10) ? few
      : 11 <= n % 100 && n % 100 <= 19 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    return i === 1 && v === 0 ? one
      : v === 0 && (2 <= i % 10 && i % 10 <= 4) && (i % 100 < 12 || 14 < i % 100) ? few
      : v === 0 && i !== 1 && (0 <= i % 10 && i % 10 <= 1) || v === 0 && (5 <= i % 10 && i % 10 <= 9) || v === 0 && (12 <= i % 100 && i % 100 <= 14) ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    return 0 <= i && i <= 1 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    return v === 0 && i % 10 === 1 && i % 100 !== 11 ? one
      : v === 0 && (2 <= i % 10 && i % 10 <= 4) && (i % 100 < 12 || 14 < i % 100) ? few
      : v === 0 && i % 10 === 0 || v === 0 && (5 <= i % 10 && i % 10 <= 9) || v === 0 && (11 <= i % 100 && i % 100 <= 14) ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var n = +s;
    return i === 0 || n === 1 ? one
      : 2 <= n && n <= 10 ? few
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var f = +(s + '.').split('.')[1];
    var n = +s;
    return (n === 0 || n === 1) || i === 0 && f === 1 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    var v = (s + '.').split('.')[1].length;
    return v === 0 && i % 100 === 1 ? one
      : v === 0 && i % 100 === 2 ? two
      : v === 0 && (3 <= i % 100 && i % 100 <= 4) || v !== 0 ? few
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return (0 <= n && n <= 1) || (11 <= n && n <= 99) ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 1 || n === 5 || n === 7 || n === 8 || n === 9 || n === 10 ? one
      : n === 2 || n === 3 ? two
      : n === 4 ? few
      : n === 6 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    return (i % 10 === 1 || i % 10 === 2 || i % 10 === 5 || i % 10 === 7 || i % 10 === 8) || (i % 100 === 20 || i % 100 === 50 || i % 100 === 70 || i % 100 === 80) ? one
      : (i % 10 === 3 || i % 10 === 4) || (i % 1000 === 100 || i % 1000 === 200 || i % 1000 === 300 || i % 1000 === 400 || i % 1000 === 500 || i % 1000 === 600 || i % 1000 === 700 || i % 1000 === 800 || i % 1000 === 900) ? few
      : i === 0 || i % 10 === 6 || (i % 100 === 40 || i % 100 === 60 || i % 100 === 90) ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return (n % 10 === 2 || n % 10 === 3) && (n % 100 !== 12 && n % 100 !== 13) ? few
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 1 || n === 3 ? one
      : n === 2 ? two
      : n === 4 ? few
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 0 || n === 7 || n === 8 || n === 9 ? zero
      : n === 1 ? one
      : n === 2 ? two
      : n === 3 || n === 4 ? few
      : n === 5 || n === 6 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n % 10 === 1 && n % 100 !== 11 ? one
      : n % 10 === 2 && n % 100 !== 12 ? two
      : n % 10 === 3 && n % 100 !== 13 ? few
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 1 ? one
      : n === 2 || n === 3 ? two
      : n === 4 ? few
      : n === 6 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 1 || n === 5 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 11 || n === 8 || n === 80 || n === 800 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    return i === 1 ? one
      : i === 0 || ((2 <= i % 100 && i % 100 <= 20) || i % 100 === 40 || i % 100 === 60 || i % 100 === 80) ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n % 10 === 6 || n % 10 === 9 || n % 10 === 0 && n !== 0 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var i = Math.floor(Math.abs(+s));
    return i % 10 === 1 && i % 100 !== 11 ? one
      : i % 10 === 2 && i % 100 !== 12 ? two
      : (i % 10 === 7 || i % 10 === 8) && (i % 100 !== 17 && i % 100 !== 18) ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 1 ? one
      : n === 2 || n === 3 ? two
      : n === 4 ? few
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return 1 <= n && n <= 4 ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return (n === 1 || n === 5 || (7 <= n && n <= 9)) ? one
      : n === 2 || n === 3 ? two
      : n === 4 ? few
      : n === 6 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n === 1 ? one
      : n % 10 === 4 && n % 100 !== 14 ? many
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return (n % 10 === 1 || n % 10 === 2) && (n % 100 !== 11 && n % 100 !== 12) ? one
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return (n % 10 === 6 || n % 10 === 9) || n === 10 ? few
      : other
  },
  function (s/*: string | number */)/*: Rule */ {
    var n = +s;
    return n % 10 === 3 && n % 100 !== 13 ? few
      : other
  }
];

var plurals = {
  af: { cardinal: f[0] },
  ak: { cardinal: f[1] },
  am: { cardinal: f[2] },
  ar: { cardinal: f[3] },
  ars: { cardinal: f[3] },
  as: { cardinal: f[2], ordinal: f[34] },
  asa: { cardinal: f[0] },
  ast: { cardinal: f[4] },
  az: { cardinal: f[0], ordinal: f[35] },
  be: { cardinal: f[5], ordinal: f[36] },
  bem: { cardinal: f[0] },
  bez: { cardinal: f[0] },
  bg: { cardinal: f[0] },
  bh: { cardinal: f[1] },
  bn: { cardinal: f[2], ordinal: f[34] },
  br: { cardinal: f[6] },
  brx: { cardinal: f[0] },
  bs: { cardinal: f[7] },
  ca: { cardinal: f[4], ordinal: f[37] },
  ce: { cardinal: f[0] },
  cgg: { cardinal: f[0] },
  chr: { cardinal: f[0] },
  ckb: { cardinal: f[0] },
  cs: { cardinal: f[8] },
  cy: { cardinal: f[9], ordinal: f[38] },
  da: { cardinal: f[10] },
  de: { cardinal: f[4] },
  dsb: { cardinal: f[11] },
  dv: { cardinal: f[0] },
  ee: { cardinal: f[0] },
  el: { cardinal: f[0] },
  en: { cardinal: f[4], ordinal: f[39] },
  eo: { cardinal: f[0] },
  es: { cardinal: f[0] },
  et: { cardinal: f[4] },
  eu: { cardinal: f[0] },
  fa: { cardinal: f[2] },
  ff: { cardinal: f[12] },
  fi: { cardinal: f[4] },
  fil: { cardinal: f[13], ordinal: f[0] },
  fo: { cardinal: f[0] },
  fr: { cardinal: f[12], ordinal: f[0] },
  fur: { cardinal: f[0] },
  fy: { cardinal: f[4] },
  ga: { cardinal: f[14], ordinal: f[0] },
  gd: { cardinal: f[15] },
  gl: { cardinal: f[4] },
  gsw: { cardinal: f[0] },
  gu: { cardinal: f[2], ordinal: f[40] },
  guw: { cardinal: f[1] },
  gv: { cardinal: f[16] },
  ha: { cardinal: f[0] },
  haw: { cardinal: f[0] },
  he: { cardinal: f[17] },
  hi: { cardinal: f[2], ordinal: f[40] },
  hr: { cardinal: f[7] },
  hsb: { cardinal: f[11] },
  hu: { cardinal: f[0], ordinal: f[41] },
  hy: { cardinal: f[12], ordinal: f[0] },
  io: { cardinal: f[4] },
  is: { cardinal: f[18] },
  it: { cardinal: f[4], ordinal: f[42] },
  iu: { cardinal: f[19] },
  iw: { cardinal: f[17] },
  jgo: { cardinal: f[0] },
  ji: { cardinal: f[4] },
  jmc: { cardinal: f[0] },
  ka: { cardinal: f[0], ordinal: f[43] },
  kab: { cardinal: f[12] },
  kaj: { cardinal: f[0] },
  kcg: { cardinal: f[0] },
  kk: { cardinal: f[0], ordinal: f[44] },
  kkj: { cardinal: f[0] },
  kl: { cardinal: f[0] },
  kn: { cardinal: f[2] },
  ks: { cardinal: f[0] },
  ksb: { cardinal: f[0] },
  ksh: { cardinal: f[20] },
  ku: { cardinal: f[0] },
  kw: { cardinal: f[19] },
  ky: { cardinal: f[0] },
  lag: { cardinal: f[21] },
  lb: { cardinal: f[0] },
  lg: { cardinal: f[0] },
  ln: { cardinal: f[1] },
  lt: { cardinal: f[22] },
  lv: { cardinal: f[23] },
  mas: { cardinal: f[0] },
  mg: { cardinal: f[1] },
  mgo: { cardinal: f[0] },
  mk: { cardinal: f[24], ordinal: f[45] },
  ml: { cardinal: f[0] },
  mn: { cardinal: f[0] },
  mo: { cardinal: f[25], ordinal: f[0] },
  mr: { cardinal: f[2], ordinal: f[46] },
  mt: { cardinal: f[26] },
  nah: { cardinal: f[0] },
  naq: { cardinal: f[19] },
  nb: { cardinal: f[0] },
  nd: { cardinal: f[0] },
  ne: { cardinal: f[0], ordinal: f[47] },
  nl: { cardinal: f[4] },
  nn: { cardinal: f[0] },
  nnh: { cardinal: f[0] },
  no: { cardinal: f[0] },
  nr: { cardinal: f[0] },
  nso: { cardinal: f[1] },
  ny: { cardinal: f[0] },
  nyn: { cardinal: f[0] },
  om: { cardinal: f[0] },
  or: { cardinal: f[0], ordinal: f[48] },
  os: { cardinal: f[0] },
  pa: { cardinal: f[1] },
  pap: { cardinal: f[0] },
  pl: { cardinal: f[27] },
  prg: { cardinal: f[23] },
  ps: { cardinal: f[0] },
  pt: { cardinal: f[28] },
  'pt-PT': { cardinal: f[4] },
  rm: { cardinal: f[0] },
  ro: { cardinal: f[25], ordinal: f[0] },
  rof: { cardinal: f[0] },
  ru: { cardinal: f[29] },
  rwk: { cardinal: f[0] },
  saq: { cardinal: f[0] },
  scn: { cardinal: f[4], ordinal: f[42] },
  sd: { cardinal: f[0] },
  sdh: { cardinal: f[0] },
  se: { cardinal: f[19] },
  seh: { cardinal: f[0] },
  sh: { cardinal: f[7] },
  shi: { cardinal: f[30] },
  si: { cardinal: f[31] },
  sk: { cardinal: f[8] },
  sl: { cardinal: f[32] },
  sma: { cardinal: f[19] },
  smi: { cardinal: f[19] },
  smj: { cardinal: f[19] },
  smn: { cardinal: f[19] },
  sms: { cardinal: f[19] },
  sn: { cardinal: f[0] },
  so: { cardinal: f[0] },
  sq: { cardinal: f[0], ordinal: f[49] },
  sr: { cardinal: f[7] },
  ss: { cardinal: f[0] },
  ssy: { cardinal: f[0] },
  st: { cardinal: f[0] },
  sv: { cardinal: f[4], ordinal: f[50] },
  sw: { cardinal: f[4] },
  syr: { cardinal: f[0] },
  ta: { cardinal: f[0] },
  te: { cardinal: f[0] },
  teo: { cardinal: f[0] },
  ti: { cardinal: f[1] },
  tig: { cardinal: f[0] },
  tk: { cardinal: f[0], ordinal: f[51] },
  tl: { cardinal: f[13], ordinal: f[0] },
  tn: { cardinal: f[0] },
  tr: { cardinal: f[0] },
  ts: { cardinal: f[0] },
  tzm: { cardinal: f[33] },
  ug: { cardinal: f[0] },
  uk: { cardinal: f[29], ordinal: f[52] },
  ur: { cardinal: f[4] },
  uz: { cardinal: f[0] },
  ve: { cardinal: f[0] },
  vo: { cardinal: f[0] },
  vun: { cardinal: f[0] },
  wa: { cardinal: f[1] },
  wae: { cardinal: f[0] },
  xh: { cardinal: f[0] },
  xog: { cardinal: f[0] },
  yi: { cardinal: f[4] },
  zu: { cardinal: f[2] },
  lo: { ordinal: f[0] },
  ms: { ordinal: f[0] },
  vi: { ordinal: f[0] }
};

var formatMessageInterpret = createCommonjsModule(function (module, exports) {




/*::
import type {
  AST,
  SubMessages
} from '../format-message-parse'
type Locale = string
type Locales = Locale | Locale[]
type Placeholder = any[] // https://github.com/facebook/flow/issues/4050
export type Type = (Placeholder, Locales) => (any, ?Object) => any
export type Types = { [string]: Type }
*/

exports = module.exports = function interpret (
  ast/*: AST */,
  locale/*:: ?: Locales */,
  types/*:: ?: Types */
)/*: (args?: Object) => string */ {
  return interpretAST(ast, null, locale || 'en', types || {}, true)
};

exports.toParts = function toParts (
  ast/*: AST */,
  locale/*:: ?: Locales */,
  types/*:: ?: Types */
)/*: (args?: Object) => any[] */ {
  return interpretAST(ast, null, locale || 'en', types || {}, false)
};

function interpretAST (
  elements/*: any[] */,
  parent/*: ?Placeholder */,
  locale/*: Locales */,
  types/*: Types */,
  join/*: boolean */
)/*: Function */ {
  var parts = elements.map(function (element) {
    return interpretElement(element, parent, locale, types, join)
  });

  if (!join) {
    return function format (args) {
      return parts.reduce(function (parts, part) {
        return parts.concat(part(args))
      }, [])
    }
  }

  if (parts.length === 1) return parts[0]
  return function format (args) {
    var message = '';
    for (var e = 0; e < parts.length; ++e) {
      message += parts[e](args);
    }
    return message
  }
}

function interpretElement (
  element/*: Placeholder */,
  parent/*: ?Placeholder */,
  locale/*: Locales */,
  types/*: Types */,
  join/*: boolean */
)/*: Function */ {
  if (typeof element === 'string') {
    var value/*: string */ = element;
    return function format () { return value }
  }

  var id = element[0];
  var type = element[1];

  if (parent && element[0] === '#') {
    id = parent[0];
    var offset = parent[2];
    var formatter = (types.number || defaults.number)([ id, 'number' ], locale);
    return function format (args) {
      return formatter(getArg(id, args) - offset, args)
    }
  }

  // pre-process children
  var children;
  if (type === 'plural' || type === 'selectordinal') {
    children = {};
    Object.keys(element[3]).forEach(function (key) {
      children[key] = interpretAST(element[3][key], element, locale, types, join);
    });
    element = [ element[0], element[1], element[2], children ];
  } else if (element[2] && typeof element[2] === 'object') {
    children = {};
    Object.keys(element[2]).forEach(function (key) {
      children[key] = interpretAST(element[2][key], element, locale, types, join);
    });
    element = [ element[0], element[1], children ];
  }

  var getFrmt = type && (types[type] || defaults[type]);
  if (getFrmt) {
    var frmt = getFrmt(element, locale);
    return function format (args) {
      return frmt(getArg(id, args), args)
    }
  }

  return join
    ? function format (args) { return String(getArg(id, args)) }
    : function format (args) { return getArg(id, args) }
}

function getArg (id/*: string */, args/*: ?Object */)/*: any */ {
  if (args && (id in args)) return args[id]
  var parts = id.split('.');
  var a = args;
  for (var i = 0, ii = parts.length; a && i < ii; ++i) {
    a = a[parts[i]];
  }
  return a
}

function interpretNumber (element/*: Placeholder */, locales/*: Locales */) {
  var style = element[2];
  var options = formatMessageFormats.number[style] || formatMessageFormats.parseNumberPattern(style) || formatMessageFormats.number.default;
  return new Intl.NumberFormat(locales, options).format
}

function interpretDuration (element/*: Placeholder */, locales/*: Locales */) {
  var style = element[2];
  var options = formatMessageFormats.duration[style] || formatMessageFormats.duration.default;
  var fs = new Intl.NumberFormat(locales, options.seconds).format;
  var fm = new Intl.NumberFormat(locales, options.minutes).format;
  var fh = new Intl.NumberFormat(locales, options.hours).format;
  var sep = /^fi$|^fi-|^da/.test(String(locales)) ? '.' : ':';

  return function (s, args) {
    s = +s;
    if (!isFinite(s)) return fs(s)
    var h = ~~(s / 60 / 60); // ~~ acts much like Math.trunc
    var m = ~~(s / 60 % 60);
    var dur = (h ? (fh(Math.abs(h)) + sep) : '') +
      fm(Math.abs(m)) + sep + fs(Math.abs(s % 60));
    return s < 0 ? fh(-1).replace(fh(1), dur) : dur
  }
}

function interpretDateTime (element/*: Placeholder */, locales/*: Locales */) {
  var type = element[1];
  var style = element[2];
  var options = formatMessageFormats[type][style] || formatMessageFormats.parseDatePattern(style) || formatMessageFormats[type].default;
  return new Intl.DateTimeFormat(locales, options).format
}

function interpretPlural (element/*: Placeholder */, locales/*: Locales */) {
  var type = element[1];
  var pluralType = type === 'selectordinal' ? 'ordinal' : 'cardinal';
  var offset = element[2];
  var children = element[3];
  var pluralRules;
  if (Intl.PluralRules && Intl.PluralRules.supportedLocalesOf(locales).length > 0) {
    pluralRules = new Intl.PluralRules(locales, { type: pluralType });
  } else {
    var locale = lookupClosestLocale(locales, plurals);
    var select = (locale && plurals[locale][pluralType]) || returnOther;
    pluralRules = { select: select };
  }

  return function (value, args) {
    var clause =
      children['=' + +value] ||
      children[pluralRules.select(value - offset)] ||
      children.other;
    return clause(args)
  }
}

function returnOther (/*:: n:number */) { return 'other' }

function interpretSelect (element/*: Placeholder */, locales/*: Locales */) {
  var children = element[2];
  return function (value, args) {
    var clause = children[value] || children.other;
    return clause(args)
  }
}

var defaults/*: Types */ = {
  number: interpretNumber,
  ordinal: interpretNumber, // TODO: support rbnf
  spellout: interpretNumber, // TODO: support rbnf
  duration: interpretDuration,
  date: interpretDateTime,
  time: interpretDateTime,
  plural: interpretPlural,
  selectordinal: interpretPlural,
  select: interpretSelect
};
exports.types = defaults;
});
formatMessageInterpret.toParts;
formatMessageInterpret.types;

var formatMessageParse = createCommonjsModule(function (module, exports) {

/*::
export type AST = Element[]
export type Element = string | Placeholder
export type Placeholder = Plural | Styled | Typed | Simple
export type Plural = [ string, 'plural' | 'selectordinal', number, SubMessages ]
export type Styled = [ string, string, string | SubMessages ]
export type Typed = [ string, string ]
export type Simple = [ string ]
export type SubMessages = { [string]: AST }
export type Token = [ TokenType, string ]
export type TokenType = 'text' | 'space' | 'id' | 'type' | 'style' | 'offset' | 'number' | 'selector' | 'syntax'
type Context = {|
  pattern: string,
  index: number,
  tagsType: ?string,
  tokens: ?Token[]
|}
*/

var ARG_OPN = '{';
var ARG_CLS = '}';
var ARG_SEP = ',';
var NUM_ARG = '#';
var TAG_OPN = '<';
var TAG_CLS = '>';
var TAG_END = '</';
var TAG_SELF_CLS = '/>';
var ESC = '\'';
var OFFSET = 'offset:';
var simpleTypes = [
  'number',
  'date',
  'time',
  'ordinal',
  'duration',
  'spellout'
];
var submTypes = [
  'plural',
  'select',
  'selectordinal'
];

/**
 * parse
 *
 * Turns this:
 *  `You have { numBananas, plural,
 *       =0 {no bananas}
 *      one {a banana}
 *    other {# bananas}
 *  } for sale`
 *
 * into this:
 *  [ "You have ", [ "numBananas", "plural", 0, {
 *       "=0": [ "no bananas" ],
 *      "one": [ "a banana" ],
 *    "other": [ [ '#' ], " bananas" ]
 *  } ], " for sale." ]
 *
 * tokens:
 *  [
 *    [ "text", "You have " ],
 *    [ "syntax", "{" ],
 *    [ "space", " " ],
 *    [ "id", "numBananas" ],
 *    [ "syntax", ", " ],
 *    [ "space", " " ],
 *    [ "type", "plural" ],
 *    [ "syntax", "," ],
 *    [ "space", "\n     " ],
 *    [ "selector", "=0" ],
 *    [ "space", " " ],
 *    [ "syntax", "{" ],
 *    [ "text", "no bananas" ],
 *    [ "syntax", "}" ],
 *    [ "space", "\n    " ],
 *    [ "selector", "one" ],
 *    [ "space", " " ],
 *    [ "syntax", "{" ],
 *    [ "text", "a banana" ],
 *    [ "syntax", "}" ],
 *    [ "space", "\n  " ],
 *    [ "selector", "other" ],
 *    [ "space", " " ],
 *    [ "syntax", "{" ],
 *    [ "syntax", "#" ],
 *    [ "text", " bananas" ],
 *    [ "syntax", "}" ],
 *    [ "space", "\n" ],
 *    [ "syntax", "}" ],
 *    [ "text", " for sale." ]
 *  ]
 **/
exports = module.exports = function parse (
  pattern/*: string */,
  options/*:: ?: { tagsType?: string, tokens?: Token[] } */
)/*: AST */ {
  return parseAST({
    pattern: String(pattern),
    index: 0,
    tagsType: (options && options.tagsType) || null,
    tokens: (options && options.tokens) || null
  }, '')
};

function parseAST (current/*: Context */, parentType/*: string */)/*: AST */ {
  var pattern = current.pattern;
  var length = pattern.length;
  var elements/*: AST */ = [];
  var start = current.index;
  var text = parseText(current, parentType);
  if (text) elements.push(text);
  if (text && current.tokens) current.tokens.push([ 'text', pattern.slice(start, current.index) ]);
  while (current.index < length) {
    if (pattern[current.index] === ARG_CLS) {
      if (!parentType) throw expected(current)
      break
    }
    if (parentType && current.tagsType && pattern.slice(current.index, current.index + TAG_END.length) === TAG_END) break
    elements.push(parsePlaceholder(current));
    start = current.index;
    text = parseText(current, parentType);
    if (text) elements.push(text);
    if (text && current.tokens) current.tokens.push([ 'text', pattern.slice(start, current.index) ]);
  }
  return elements
}

function parseText (current/*: Context */, parentType/*: string */)/*: string */ {
  var pattern = current.pattern;
  var length = pattern.length;
  var isHashSpecial = (parentType === 'plural' || parentType === 'selectordinal');
  var isAngleSpecial = !!current.tagsType;
  var isArgStyle = (parentType === '{style}');
  var text = '';
  while (current.index < length) {
    var char = pattern[current.index];
    if (
      char === ARG_OPN || char === ARG_CLS ||
      (isHashSpecial && char === NUM_ARG) ||
      (isAngleSpecial && char === TAG_OPN) ||
      (isArgStyle && isWhitespace(char.charCodeAt(0)))
    ) {
      break
    } else if (char === ESC) {
      char = pattern[++current.index];
      if (char === ESC) { // double is always 1 '
        text += char;
        ++current.index;
      } else if (
        // only when necessary
        char === ARG_OPN || char === ARG_CLS ||
        (isHashSpecial && char === NUM_ARG) ||
        (isAngleSpecial && char === TAG_OPN) ||
        isArgStyle
      ) {
        text += char;
        while (++current.index < length) {
          char = pattern[current.index];
          if (char === ESC && pattern[current.index + 1] === ESC) { // double is always 1 '
            text += ESC;
            ++current.index;
          } else if (char === ESC) { // end of quoted
            ++current.index;
            break
          } else {
            text += char;
          }
        }
      } else { // lone ' is just a '
        text += ESC;
        // already incremented
      }
    } else {
      text += char;
      ++current.index;
    }
  }
  return text
}

function isWhitespace (code/*: number */)/*: boolean */ {
  return (
    (code >= 0x09 && code <= 0x0D) ||
    code === 0x20 || code === 0x85 || code === 0xA0 || code === 0x180E ||
    (code >= 0x2000 && code <= 0x200D) ||
    code === 0x2028 || code === 0x2029 || code === 0x202F || code === 0x205F ||
    code === 0x2060 || code === 0x3000 || code === 0xFEFF
  )
}

function skipWhitespace (current/*: Context */)/*: void */ {
  var pattern = current.pattern;
  var length = pattern.length;
  var start = current.index;
  while (current.index < length && isWhitespace(pattern.charCodeAt(current.index))) {
    ++current.index;
  }
  if (start < current.index && current.tokens) {
    current.tokens.push([ 'space', current.pattern.slice(start, current.index) ]);
  }
}

function parsePlaceholder (current/*: Context */)/*: Placeholder */ {
  var pattern = current.pattern;
  if (pattern[current.index] === NUM_ARG) {
    if (current.tokens) current.tokens.push([ 'syntax', NUM_ARG ]);
    ++current.index; // move passed #
    return [ NUM_ARG ]
  }

  var tag = parseTag(current);
  if (tag) return tag

  /* istanbul ignore if should be unreachable if parseAST and parseText are right */
  if (pattern[current.index] !== ARG_OPN) throw expected(current, ARG_OPN)
  if (current.tokens) current.tokens.push([ 'syntax', ARG_OPN ]);
  ++current.index; // move passed {
  skipWhitespace(current);

  var id = parseId(current);
  if (!id) throw expected(current, 'placeholder id')
  if (current.tokens) current.tokens.push([ 'id', id ]);
  skipWhitespace(current);

  var char = pattern[current.index];
  if (char === ARG_CLS) { // end placeholder
    if (current.tokens) current.tokens.push([ 'syntax', ARG_CLS ]);
    ++current.index; // move passed }
    return [ id ]
  }

  if (char !== ARG_SEP) throw expected(current, ARG_SEP + ' or ' + ARG_CLS)
  if (current.tokens) current.tokens.push([ 'syntax', ARG_SEP ]);
  ++current.index; // move passed ,
  skipWhitespace(current);

  var type = parseId(current);
  if (!type) throw expected(current, 'placeholder type')
  if (current.tokens) current.tokens.push([ 'type', type ]);
  skipWhitespace(current);
  char = pattern[current.index];
  if (char === ARG_CLS) { // end placeholder
    if (current.tokens) current.tokens.push([ 'syntax', ARG_CLS ]);
    if (type === 'plural' || type === 'selectordinal' || type === 'select') {
      throw expected(current, type + ' sub-messages')
    }
    ++current.index; // move passed }
    return [ id, type ]
  }

  if (char !== ARG_SEP) throw expected(current, ARG_SEP + ' or ' + ARG_CLS)
  if (current.tokens) current.tokens.push([ 'syntax', ARG_SEP ]);
  ++current.index; // move passed ,
  skipWhitespace(current);

  var arg;
  if (type === 'plural' || type === 'selectordinal') {
    var offset = parsePluralOffset(current);
    skipWhitespace(current);
    arg = [ id, type, offset, parseSubMessages(current, type) ];
  } else if (type === 'select') {
    arg = [ id, type, parseSubMessages(current, type) ];
  } else if (simpleTypes.indexOf(type) >= 0) {
    arg = [ id, type, parseSimpleFormat(current) ];
  } else { // custom placeholder type
    var index = current.index;
    var format/*: string | SubMessages */ = parseSimpleFormat(current);
    skipWhitespace(current);
    if (pattern[current.index] === ARG_OPN) {
      current.index = index; // rewind, since should have been submessages
      format = parseSubMessages(current, type);
    }
    arg = [ id, type, format ];
  }

  skipWhitespace(current);
  if (pattern[current.index] !== ARG_CLS) throw expected(current, ARG_CLS)
  if (current.tokens) current.tokens.push([ 'syntax', ARG_CLS ]);
  ++current.index; // move passed }
  return arg
}

function parseTag (current/*: Context */)/*: ?Placeholder */ {
  var tagsType = current.tagsType;
  if (!tagsType || current.pattern[current.index] !== TAG_OPN) return

  if (current.pattern.slice(current.index, current.index + TAG_END.length) === TAG_END) {
    throw expected(current, null, 'closing tag without matching opening tag')
  }
  if (current.tokens) current.tokens.push([ 'syntax', TAG_OPN ]);
  ++current.index; // move passed <

  var id = parseId(current, true);
  if (!id) throw expected(current, 'placeholder id')
  if (current.tokens) current.tokens.push([ 'id', id ]);
  skipWhitespace(current);

  if (current.pattern.slice(current.index, current.index + TAG_SELF_CLS.length) === TAG_SELF_CLS) {
    if (current.tokens) current.tokens.push([ 'syntax', TAG_SELF_CLS ]);
    current.index += TAG_SELF_CLS.length;
    return [ id, tagsType ]
  }
  if (current.pattern[current.index] !== TAG_CLS) throw expected(current, TAG_CLS)
  if (current.tokens) current.tokens.push([ 'syntax', TAG_CLS ]);
  ++current.index; // move passed >

  var children = parseAST(current, tagsType);

  var end = current.index;
  if (current.pattern.slice(current.index, current.index + TAG_END.length) !== TAG_END) throw expected(current, TAG_END + id + TAG_CLS)
  if (current.tokens) current.tokens.push([ 'syntax', TAG_END ]);
  current.index += TAG_END.length;
  var closeId = parseId(current, true);
  if (closeId && current.tokens) current.tokens.push([ 'id', closeId ]);
  if (id !== closeId) {
    current.index = end; // rewind for better error message
    throw expected(current, TAG_END + id + TAG_CLS, TAG_END + closeId + TAG_CLS)
  }
  skipWhitespace(current);
  if (current.pattern[current.index] !== TAG_CLS) throw expected(current, TAG_CLS)
  if (current.tokens) current.tokens.push([ 'syntax', TAG_CLS ]);
  ++current.index; // move passed >

  return [ id, tagsType, { children: children } ]
}

function parseId (current/*: Context */, isTag/*:: ?: boolean */)/*: string */ {
  var pattern = current.pattern;
  var length = pattern.length;
  var id = '';
  while (current.index < length) {
    var char = pattern[current.index];
    if (
      char === ARG_OPN || char === ARG_CLS || char === ARG_SEP ||
      char === NUM_ARG || char === ESC || isWhitespace(char.charCodeAt(0)) ||
      (isTag && (char === TAG_OPN || char === TAG_CLS || char === '/'))
    ) break
    id += char;
    ++current.index;
  }
  return id
}

function parseSimpleFormat (current/*: Context */)/*: string */ {
  var start = current.index;
  var style = parseText(current, '{style}');
  if (!style) throw expected(current, 'placeholder style name')
  if (current.tokens) current.tokens.push([ 'style', current.pattern.slice(start, current.index) ]);
  return style
}

function parsePluralOffset (current/*: Context */)/*: number */ {
  var pattern = current.pattern;
  var length = pattern.length;
  var offset = 0;
  if (pattern.slice(current.index, current.index + OFFSET.length) === OFFSET) {
    if (current.tokens) current.tokens.push([ 'offset', 'offset' ], [ 'syntax', ':' ]);
    current.index += OFFSET.length; // move passed offset:
    skipWhitespace(current);
    var start = current.index;
    while (current.index < length && isDigit(pattern.charCodeAt(current.index))) {
      ++current.index;
    }
    if (start === current.index) throw expected(current, 'offset number')
    if (current.tokens) current.tokens.push([ 'number', pattern.slice(start, current.index) ]);
    offset = +pattern.slice(start, current.index);
  }
  return offset
}

function isDigit (code/*: number */)/*: boolean */ {
  return (code >= 0x30 && code <= 0x39)
}

function parseSubMessages (current/*: Context */, parentType/*: string */)/*: SubMessages */ {
  var pattern = current.pattern;
  var length = pattern.length;
  var options/*: SubMessages */ = {};
  while (current.index < length && pattern[current.index] !== ARG_CLS) {
    var selector = parseId(current);
    if (!selector) throw expected(current, 'sub-message selector')
    if (current.tokens) current.tokens.push([ 'selector', selector ]);
    skipWhitespace(current);
    options[selector] = parseSubMessage(current, parentType);
    skipWhitespace(current);
  }
  if (!options.other && submTypes.indexOf(parentType) >= 0) {
    throw expected(current, null, null, '"other" sub-message must be specified in ' + parentType)
  }
  return options
}

function parseSubMessage (current/*: Context */, parentType/*: string */)/*: AST */ {
  if (current.pattern[current.index] !== ARG_OPN) throw expected(current, ARG_OPN + ' to start sub-message')
  if (current.tokens) current.tokens.push([ 'syntax', ARG_OPN ]);
  ++current.index; // move passed {
  var message = parseAST(current, parentType);
  if (current.pattern[current.index] !== ARG_CLS) throw expected(current, ARG_CLS + ' to end sub-message')
  if (current.tokens) current.tokens.push([ 'syntax', ARG_CLS ]);
  ++current.index; // move passed }
  return message
}

function expected (current/*: Context */, expected/*:: ?: ?string */, found/*:: ?: ?string */, message/*:: ?: string */) {
  var pattern = current.pattern;
  var lines = pattern.slice(0, current.index).split(/\r?\n/);
  var offset = current.index;
  var line = lines.length;
  var column = lines.slice(-1)[0].length;
  found = found || (
    (current.index >= pattern.length) ? 'end of message pattern'
      : (parseId(current) || pattern[current.index])
  );
  if (!message) message = errorMessage(expected, found);
  message += ' in ' + pattern.replace(/\r?\n/g, '\n');
  return new SyntaxError(message, expected, found, offset, line, column)
}

function errorMessage (expected/*: ?string */, found/* string */) {
  if (!expected) return 'Unexpected ' + found + ' found'
  return 'Expected ' + expected + ' but found ' + found
}

/**
 * SyntaxError
 *  Holds information about bad syntax found in a message pattern
 **/
function SyntaxError (message/*: string */, expected/*: ?string */, found/*: ?string */, offset/*: number */, line/*: number */, column/*: number */) {
  Error.call(this, message);
  this.name = 'SyntaxError';
  this.message = message;
  this.expected = expected;
  this.found = found;
  this.offset = offset;
  this.line = line;
  this.column = column;
}
SyntaxError.prototype = Object.create(Error.prototype);
exports.SyntaxError = SyntaxError;
});
formatMessageParse.SyntaxError;

var supportedExp = new RegExp(
  '^(' + Object.keys(plurals).join('|') + ')\\b'
);

/*::
import type { Types } from 'format-message-interpret'
import type { AST } from 'format-message-parse'
type Options = {
  types: Types
}
type Internals = {
  ast: AST,
  format: (args?: Object) => string,
  locale: string,
  locales?: string | string[],
  toParts?: (args?: Object) => any[],
  options?: Options
}
*/

var internals/*: WeakMap<MessageFormat, Internals> */ = new WeakMap();

/*!
 * Intl.MessageFormat prollyfill
 * Copyright(c) 2015 Andy VanWagoner
 * MIT licensed
 **/
function MessageFormat (
  pattern/*: string */,
  locales/*:: ?: string | string[] */,
  options/*:: ?: Options */
) {
  if (!(this instanceof MessageFormat) || internals.has(this)) {
    throw new TypeError('calling MessageFormat constructor without new is invalid')
  }
  var ast = formatMessageParse(pattern);
  internals.set(this, {
    ast: ast,
    format: formatMessageInterpret(ast, locales, options && options.types),
    locale: MessageFormat.supportedLocalesOf(locales)[0] || 'en',
    locales: locales,
    options: options
  });
}
var messageFormat = MessageFormat;

// $FlowFixMe It thinks `value` needs to be defined for format
Object.defineProperties(MessageFormat.prototype, {
  format: {
    configurable: true,
    get: function format () {
      var values = internals.get(this);
      if (!values) throw new TypeError('MessageFormat.prototype.format called on value that\'s not an object initialized as a MessageFormat')
      return values.format
    }
  },
  formatToParts: {
    configurable: true,
    writable: true,
    value: function formatToParts (args/*:: ?: Object */) {
      var values = internals.get(this);
      if (!values) throw new TypeError('MessageFormat.prototype.formatToParts called on value that\'s not an object initialized as a MessageFormat')
      var frmt = values.toParts || (values.toParts = formatMessageInterpret.toParts(
        values.ast,
        values.locales,
        values.options && values.options.types
      ));
      return frmt(args)
    }
  },
  resolvedOptions: {
    configurable: true,
    writable: true,
    value: function resolvedOptions () {
      var values = internals.get(this);
      if (!values) throw new TypeError('MessageFormat.prototype.resolvedOptions called on value that\'s not an object initialized as a MessageFormat')
      return {
        locale: values.locale
      }
    }
  }
});

/* istanbul ignore else */
if (typeof Symbol !== 'undefined') {
  Object.defineProperty(MessageFormat.prototype, Symbol.toStringTag, { value: 'Object' });
}

Object.defineProperties(MessageFormat, {
  supportedLocalesOf: {
    configurable: true,
    writable: true,
    value: function supportedLocalesOf (requestedLocales/*:: ?: string | string[] */) {
      return [].concat(
        Intl.NumberFormat.supportedLocalesOf(requestedLocales),
        Intl.DateTimeFormat.supportedLocalesOf(requestedLocales),
        Intl.PluralRules ? Intl.PluralRules.supportedLocalesOf(requestedLocales) : [],
        [].concat(requestedLocales || []).filter(function (locale) {
          return supportedExp.test(locale)
        })
      ).filter(function (v, i, a) { return a.indexOf(v) === i })
    }
  }
});

/**
 * @param {Object.<string, Object>} obj
 * @returns {boolean}
 */
function isLocalizeESModule(obj) {
  return !!(obj && obj.default && typeof obj.default === 'object' && Object.keys(obj).length === 1);
}

// @ts-expect-error no types for this package

/**
 * @typedef {import('../types/LocalizeMixinTypes').NamespaceObject} NamespaceObject
 */

/** @typedef {import('../types/LocalizeMixinTypes').DatePostProcessor} DatePostProcessor */
/** @typedef {import('../types/LocalizeMixinTypes').NumberPostProcessor} NumberPostProcessor */

/**
 * `LocalizeManager` manages your translations (includes loading)
 */
class LocalizeManager {
  // eslint-disable-line no-unused-vars
  constructor({ autoLoadOnLocaleChange = false, fallbackLocale = '' } = {}) {
    this.__delegationTarget = document.createDocumentFragment();
    this._autoLoadOnLocaleChange = !!autoLoadOnLocaleChange;
    this._fallbackLocale = fallbackLocale;

    /** @type {Object.<string, Object.<string, Object>>} */
    this.__storage = {};

    /** @type {Map.<RegExp|string, function>} */
    this.__namespacePatternsMap = new Map();

    /** @type {Object.<string, function|null>} */
    this.__namespaceLoadersCache = {};

    /** @type {Object.<string, Object.<string, Promise.<Object>>>} */
    this.__namespaceLoaderPromisesCache = {};

    this.formatNumberOptions = {
      returnIfNaN: '',
      /** @type {Map<string,DatePostProcessor>} */
      postProcessors: new Map(),
    };

    this.formatDateOptions = {
      /** @type {Map<string,DatePostProcessor>} */
      postProcessors: new Map(),
    };

    /**
     * Via html[data-localize-lang], developers are allowed to set the initial locale, without
     * having to worry about whether locale is initialized before 3rd parties like Google Translate.
     * When this value differs from html[lang], we assume the 3rd party took
     * control over the page language and we set this._langAttrSetByTranslationTool to html[lang]
     */
    const initialLocale = document.documentElement.getAttribute('data-localize-lang');

    this._supportExternalTranslationTools = Boolean(initialLocale);

    if (this._supportExternalTranslationTools) {
      this.locale = initialLocale || 'en-GB';
      this._setupTranslationToolSupport();
    }

    if (!document.documentElement.lang) {
      document.documentElement.lang = this.locale || 'en-GB';
    }

    this._setupHtmlLangAttributeObserver();
  }

  _setupTranslationToolSupport() {
    /**
     * This value allows for support for Google Translate (or other 3rd parties taking control
     * of the html[lang] attribute).
     *
     * Have the following scenario in mind:
     * 1. locale is initialized by developer via html[data-localize-lang="en-US"] and
     * html[lang="en-US"]. When localize is loaded (note that this also can be after step 2 below),
     * it will sync its initial state from html[data-localize-lang]
     * 2. Google Translate kicks in for the French language. It will set html[lang="fr"].
     * This new language is not one known by us, so we most likely don't have translations for
     * this file. Therefore, we do NOT sync this value to LocalizeManager. The manager should
     * still ask for known resources (in this case for locale 'en-US')
     * 3. locale is changed (think of a language dropdown)
     * It's a bit of a weird case, because we would not expect an end user to do this. If he/she
     * does, make sure that we do not go against Google Translate, so we maintain accessibility
     * (by not altering html[lang]). We detect this by reading _langAttrSetByTranslationTool:
     * when its value is null, we consider Google translate 'not active'.
     *
     * When Google Translate is turned off by the user (html[lang=auto]),
     * `localize.locale` will be synced to html[lang] again
     *
     * Keep in mind that all of the above also works with other tools than Google Translate,
     * but this is the most widely used tool and therefore used as an example.
     */
    this._langAttrSetByTranslationTool = document.documentElement.lang || null;
  }

  teardown() {
    this._teardownHtmlLangAttributeObserver();
  }

  /**
   * @returns {string}
   */
  get locale() {
    if (this._supportExternalTranslationTools) {
      return this.__locale || '';
    }
    return document.documentElement.lang;
  }

  /**
   * @param {string} value
   */
  set locale(value) {
    /** @type {string} */
    let oldLocale;
    if (this._supportExternalTranslationTools) {
      oldLocale = /** @type {string} */ (this.__locale);
      this.__locale = value;
      if (this._langAttrSetByTranslationTool === null) {
        this._setHtmlLangAttribute(value);
      }
    } else {
      oldLocale = document.documentElement.lang;
      this._setHtmlLangAttribute(value);
    }

    if (!value.includes('-')) {
      this.__handleLanguageOnly(value);
    }

    this._onLocaleChanged(value, oldLocale);
  }

  /**
   * @param {string} locale
   */
  _setHtmlLangAttribute(locale) {
    this._teardownHtmlLangAttributeObserver();
    document.documentElement.lang = locale;
    this._setupHtmlLangAttributeObserver();
  }

  /**
   * @param {string} value
   * @throws {Error} Language only locales are not allowed(Use 'en-GB' instead of 'en')
   */
  // eslint-disable-next-line class-methods-use-this
  __handleLanguageOnly(value) {
    throw new Error(`
      Locale was set to ${value}.
      Language only locales are not allowed, please use the full language locale e.g. 'en-GB' instead of 'en'.
      See https://github.com/ing-bank/lion/issues/187 for more information.
    `);
  }

  /**
   * @returns {Promise.<Object>}
   */
  get loadingComplete() {
    return Promise.all(Object.values(this.__namespaceLoaderPromisesCache[this.locale]));
  }

  reset() {
    this.__storage = {};
    this.__namespacePatternsMap = new Map();
    this.__namespaceLoadersCache = {};
    this.__namespaceLoaderPromisesCache = {};
  }

  /**
   * @param {string} locale
   * @param {string} namespace
   * @param {object} data
   * @throws {Error} Namespace can be added only once, for a given locale
   */
  addData(locale, namespace, data) {
    if (this._isNamespaceInCache(locale, namespace)) {
      throw new Error(
        `Namespace "${namespace}" has been already added for the locale "${locale}".`,
      );
    }

    this.__storage[locale] = this.__storage[locale] || {};
    this.__storage[locale][namespace] = data;
  }

  /**
   * @param {RegExp|string} pattern
   * @param {function} loader
   */
  setupNamespaceLoader(pattern, loader) {
    this.__namespacePatternsMap.set(pattern, loader);
  }

  /**
   * @param {NamespaceObject[]} namespaces
   * @param {Object} [options]
   * @param {string} [options.locale]
   * @returns {Promise.<Object>}
   */
  loadNamespaces(namespaces, { locale } = {}) {
    return Promise.all(
      namespaces.map(
        /** @param {NamespaceObject} namespace */
        namespace => this.loadNamespace(namespace, { locale }),
      ),
    );
  }

  /**
   * @param {NamespaceObject} namespaceObj
   * @param {Object} [options]
   * @param {string} [options.locale]
   * @returns {Promise.<Object|void>}
   */
  loadNamespace(namespaceObj, { locale = this.locale } = { locale: this.locale }) {
    const isDynamicImport = typeof namespaceObj === 'object';

    const namespace = /** @type {string} */ (isDynamicImport
      ? Object.keys(namespaceObj)[0]
      : namespaceObj);

    if (this._isNamespaceInCache(locale, namespace)) {
      return Promise.resolve();
    }

    const existingLoaderPromise = this._getCachedNamespaceLoaderPromise(locale, namespace);
    if (existingLoaderPromise) {
      return existingLoaderPromise;
    }

    return this._loadNamespaceData(locale, namespaceObj, isDynamicImport, namespace);
  }

  /**
   * @param {string | string[]} keys
   * @param {Object.<string,?>} [vars]
   * @param {Object} [opts]
   * @param {string} [opts.locale]
   * @returns {string}
   */
  msg(keys, vars, opts = {}) {
    const locale = opts.locale ? opts.locale : this.locale;
    const message = this._getMessageForKeys(keys, locale);
    if (!message) {
      return '';
    }
    const formatter = new messageFormat(message, locale);
    return formatter.format(vars);
  }

  _setupHtmlLangAttributeObserver() {
    if (!this._htmlLangAttributeObserver) {
      this._htmlLangAttributeObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (this._supportExternalTranslationTools) {
            if (document.documentElement.lang === 'auto') {
              // Google Translate is switched off
              this._langAttrSetByTranslationTool = null;
              this._setHtmlLangAttribute(this.locale);
            } else {
              this._langAttrSetByTranslationTool = document.documentElement.lang;
            }
          } else {
            this._onLocaleChanged(document.documentElement.lang, mutation.oldValue || '');
          }
        });
      });
    }
    this._htmlLangAttributeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
      attributeOldValue: true,
    });
  }

  _teardownHtmlLangAttributeObserver() {
    if (this._htmlLangAttributeObserver) {
      this._htmlLangAttributeObserver.disconnect();
    }
  }

  /**
   * @param {string} locale
   * @param {string} namespace
   */
  _isNamespaceInCache(locale, namespace) {
    return !!(this.__storage[locale] && this.__storage[locale][namespace]);
  }

  /**
   * @param {string} locale
   * @param {string} namespace
   */
  _getCachedNamespaceLoaderPromise(locale, namespace) {
    if (this.__namespaceLoaderPromisesCache[locale]) {
      return this.__namespaceLoaderPromisesCache[locale][namespace];
    }
    return null;
  }

  /**
   * @param {string} locale
   * @param {NamespaceObject} namespaceObj
   * @param {boolean} isDynamicImport
   * @param {string} namespace
   * @returns {Promise.<Object|void>}
   */
  _loadNamespaceData(locale, namespaceObj, isDynamicImport, namespace) {
    const loader = this._getNamespaceLoader(namespaceObj, isDynamicImport, namespace);
    const loaderPromise = this._getNamespaceLoaderPromise(loader, locale, namespace);
    this._cacheNamespaceLoaderPromise(locale, namespace, loaderPromise);
    return loaderPromise.then(
      /**
       * @param {Object} obj
       * @param {Object} obj.default
       */
      obj => {
        const data = isLocalizeESModule(obj) ? obj.default : obj;
        this.addData(locale, namespace, data);
      },
    );
  }

  /**
   * @param {NamespaceObject} namespaceObj
   * @param {boolean} isDynamicImport
   * @param {string} namespace
   * @throws {Error} Namespace shall setup properly. Check loader!
   */
  _getNamespaceLoader(namespaceObj, isDynamicImport, namespace) {
    let loader = this.__namespaceLoadersCache[namespace];
    if (!loader) {
      if (isDynamicImport) {
        const _namespaceObj = /** @type {Object.<string,function>} */ (namespaceObj);
        loader = _namespaceObj[namespace];
        this.__namespaceLoadersCache[namespace] = loader;
      } else {
        loader = this._lookupNamespaceLoader(namespace);
        this.__namespaceLoadersCache[namespace] = loader;
      }
    }

    if (!loader) {
      throw new Error(`Namespace "${namespace}" was not properly setup.`);
    }

    this.__namespaceLoadersCache[namespace] = loader;

    return loader;
  }

  /**
   * @param {function} loader
   * @param {string} locale
   * @param {string} namespace
   * @param {string} [fallbackLocale]
   * @returns {Promise.<any>}
   * @throws {Error} Data for namespace and (locale or fallback locale) could not be loaded.
   */
  _getNamespaceLoaderPromise(loader, locale, namespace, fallbackLocale = this._fallbackLocale) {
    return loader(locale, namespace).catch(() => {
      const lang = this._getLangFromLocale(locale);
      return loader(lang, namespace).catch(() => {
        if (fallbackLocale) {
          return this._getNamespaceLoaderPromise(loader, fallbackLocale, namespace, '').catch(
            () => {
              const fallbackLang = this._getLangFromLocale(fallbackLocale);
              throw new Error(
                `Data for namespace "${namespace}" and current locale "${locale}" or fallback locale "${fallbackLocale}" could not be loaded. ` +
                  `Make sure you have data either for locale "${locale}" (and/or generic language "${lang}") or for fallback "${fallbackLocale}" (and/or "${fallbackLang}").`,
              );
            },
          );
        }
        throw new Error(
          `Data for namespace "${namespace}" and locale "${locale}" could not be loaded. ` +
            `Make sure you have data for locale "${locale}" (and/or generic language "${lang}").`,
        );
      });
    });
  }

  /**
   * @param {string} locale
   * @param {string} namespace
   * @param {Promise.<Object>} promise
   */
  _cacheNamespaceLoaderPromise(locale, namespace, promise) {
    if (!this.__namespaceLoaderPromisesCache[locale]) {
      this.__namespaceLoaderPromisesCache[locale] = {};
    }
    this.__namespaceLoaderPromisesCache[locale][namespace] = promise;
  }

  /**
   * @param {string} namespace
   * @returns {function|null}
   */
  _lookupNamespaceLoader(namespace) {
    /* eslint-disable no-restricted-syntax */
    for (const [key, value] of this.__namespacePatternsMap) {
      const isMatchingString = typeof key === 'string' && key === namespace;
      const isMatchingRegexp =
        typeof key === 'object' && key.constructor.name === 'RegExp' && key.test(namespace);
      if (isMatchingString || isMatchingRegexp) {
        return value;
      }
    }
    return null;
    /* eslint-enable no-restricted-syntax */
  }

  /**
   * @param {string} locale
   * @returns {string}
   */
  // eslint-disable-next-line class-methods-use-this
  _getLangFromLocale(locale) {
    return locale.substring(0, 2);
  }

  /**
   * @param {string} type
   * @param {EventListener} listener
   * @param {...Object} options
   */
  addEventListener(type, listener, ...options) {
    this.__delegationTarget.addEventListener(type, listener, ...options);
  }

  /**
   * @param {string} type
   * @param {EventListener} listener
   * @param {...Object} options
   */
  removeEventListener(type, listener, ...options) {
    this.__delegationTarget.removeEventListener(type, listener, ...options);
  }

  /**
   *  @param {CustomEvent} event
   */
  dispatchEvent(event) {
    this.__delegationTarget.dispatchEvent(event);
  }

  /**
   * @param {string} newLocale
   * @param {string} oldLocale
   * @returns {undefined}
   */
  _onLocaleChanged(newLocale, oldLocale) {
    if (newLocale === oldLocale) {
      return;
    }
    if (this._autoLoadOnLocaleChange) {
      this._loadAllMissing(newLocale, oldLocale);
    }
    this.dispatchEvent(new CustomEvent('localeChanged', { detail: { newLocale, oldLocale } }));
  }

  /**
   * @param {string} newLocale
   * @param {string} oldLocale
   * @returns {Promise.<Object>}
   */
  _loadAllMissing(newLocale, oldLocale) {
    const oldLocaleNamespaces = this.__storage[oldLocale] || {};
    const newLocaleNamespaces = this.__storage[newLocale] || {};
    /** @type {Promise<Object|void>[]} */
    const promises = [];
    Object.keys(oldLocaleNamespaces).forEach(namespace => {
      const newNamespaceData = newLocaleNamespaces[namespace];
      if (!newNamespaceData) {
        promises.push(
          this.loadNamespace(namespace, {
            locale: newLocale,
          }),
        );
      }
    });
    return Promise.all(promises);
  }

  /**
   * @param {string | string[]} keys
   * @param {string} locale
   * @returns {string | undefined}
   */
  _getMessageForKeys(keys, locale) {
    if (typeof keys === 'string') {
      return this._getMessageForKey(keys, locale);
    }
    const reversedKeys = Array.from(keys).reverse(); // Array.from prevents mutation of argument
    let key;
    let message;
    while (reversedKeys.length) {
      key = reversedKeys.pop();
      message = this._getMessageForKey(key, locale);
      if (message) {
        return message;
      }
    }
    return undefined;
  }

  /**
   * @param {string | undefined} key
   * @param {string} locale
   * @returns {string}
   * @throws {Error} `key`is missing namespace. The format for `key` is "namespace:name"
   *
   */
  _getMessageForKey(key, locale) {
    if (!key || key.indexOf(':') === -1) {
      throw new Error(
        `Namespace is missing in the key "${key}". The format for keys is "namespace:name".`,
      );
    }
    const [ns, namesString] = key.split(':');
    const namespaces = this.__storage[locale];
    const messages = namespaces ? namespaces[ns] : {};
    const names = namesString.split('.');
    const result = names.reduce(
      /**
       * @param {Object.<string, any> | string} message
       * @param {string} name
       * @returns {string}
       */
      (message, name) => (typeof message === 'object' ? message[name] : message),
      messages,
    );

    return String(result || '');
  }

  /**
   * @param {{locale:string, postProcessor:DatePostProcessor}} options
   */
  setDatePostProcessorForLocale({ locale, postProcessor }) {
    this.formatDateOptions.postProcessors.set(locale, postProcessor);
  }

  /**
   * @param {{locale:string, postProcessor:NumberPostProcessor}} options
   */
  setNumberPostProcessorForLocale({ locale, postProcessor }) {
    this.formatNumberOptions.postProcessors.set(locale, postProcessor);
  }
}

/** @type {LocalizeManager} */
// eslint-disable-next-line import/no-mutable-exports
let localize =
  singletonManager.get('@lion/localize::localize::0.10.x') ||
  new LocalizeManager({
    autoLoadOnLocaleChange: true,
    fallbackLocale: 'en-GB',
  });

/**
 * Gets the locale to use
 *
 * @param {string} [locale] Locale to override browser locale
 * @returns {string}
 */
function getLocale(locale) {
  if (locale) {
    return locale;
  }
  if (localize && localize.locale) {
    return localize.locale;
  }
  return 'en-GB';
}

/**
 * To filter out some added characters in IE
 *
 * @param {string} str
 * @param {string} [locale='']
 * @param {import('@lion/localize/types/LocalizeMixinTypes').FormatDateOptions} [options] Intl options are available
 * @returns {string}
 */
function normalizeIntlDate(str, locale = '', { weekday, year, month, day } = {}) {
  const dateString = [];
  for (let i = 0, n = str.length; i < n; i += 1) {
    // remove unicode 160
    if (str.charCodeAt(i) === 160) {
      dateString.push(' ');
      // remove unicode 8206
    } else if (str.charCodeAt(i) === 8206) {
      dateString.push('');
    } else {
      dateString.push(str.charAt(i));
    }
  }

  const result = dateString.join('');

  // Normalize webkit date formatting without year
  if (!year && weekday === 'long' && month === 'long' && day === '2-digit') {
    const CHINESE_LOCALES = [
      // Webkit has a space while chrome and firefox not. Example: ("10月12日 星期六")
      'zh-CN',
      'zh-Hans',
      'zh-Hans-CN',
      'zh-Hans-HK',
      'zh-Hans-MO',
      'zh-Hans-SG',
      // Skip 'zh-Hant' and 'zh-Hant-TW', since webkit/firefox/chromium are aligned.
      // 'zh-Hant',
      // 'zh-Hant-TW',
      'zh-Hant-HK',
      'zh-Hant-MO',
    ];

    if (CHINESE_LOCALES.includes(locale)) {
      return result.replace(' ', '');
    }

    if (result.indexOf(',') === -1 && locale === 'en-GB') {
      // Saturday 12 October -> Saturday, 12 October
      const match = result.match(/^(\w*) (\d*) (\w*)$/);
      if (match !== null) {
        return `${match[1]}, ${match[2]} ${match[3]}`;
      }
    }

    if (result.indexOf(', ') !== -1 && locale === 'sk-SK') {
      // sobota, 12. októbra -> sobota 12. októbra
      return result.replace(', ', ' ');
    }

    if (locale === 'en-PH') {
      // Saturday, October 12 -> Saturday, 12 October
      const match = result.match(/^(\w*), (\w*) (\d*)$/);
      if (match !== null) {
        return `${match[1]}, ${match[3]} ${match[2]}`;
      }
    }
  }

  return result;
}

/** @typedef {import('../../types/LocalizeMixinTypes').DatePostProcessor} DatePostProcessor */

/**
 * Formats date based on locale and options
 *
 * @param {Date} date
 * @param {import('@lion/localize/types/LocalizeMixinTypes').FormatDateOptions} [options] Intl options are available
 * @returns {string}
 */
function formatDate(date, options) {
  if (!(date instanceof Date)) {
    return '';
  }

  const formatOptions =
    options ||
    /** @type {import('@lion/localize/types/LocalizeMixinTypes').FormatDateOptions} */ ({});
  /**
   * Set smart defaults if:
   * 1) no options object is passed
   * 2) options object is passed, but none of the following props on it: day, month, year.
   */
  if (!options || (options && !options.day && !options.month && !options.year)) {
    formatOptions.year = 'numeric';
    formatOptions.month = '2-digit';
    formatOptions.day = '2-digit';
  }
  const computedLocale = getLocale(formatOptions && formatOptions.locale);
  let formattedDate = '';
  try {
    formattedDate = new Intl.DateTimeFormat(computedLocale, formatOptions).format(date);
  } catch (e) {
    formattedDate = '';
  }

  if (localize.formatDateOptions.postProcessors.size > 0) {
    Array.from(localize.formatDateOptions.postProcessors).forEach(([locale, fn]) => {
      if (locale === computedLocale) {
        formattedDate = fn(formattedDate);
      }
    });
  }

  if (formatOptions.postProcessors && formatOptions.postProcessors.size > 0) {
    Array.from(formatOptions.postProcessors).forEach(([locale, fn]) => {
      if (locale === computedLocale) {
        formattedDate = fn(formattedDate);
      }
    });
  }

  return normalizeIntlDate(formattedDate, computedLocale, formatOptions);
}

/**
 * To trim the date
 *
 * @param {string} dateAsString
 * @returns {string}
 */
function trim(dateAsString) {
  return dateAsString.replace(/^[^\d]*/g, '').replace(/[^\d]*$/g, '');
}

/**
 * To clean date from added characters from IE
 *
 * @param {string} dateAsString
 * @returns {string}
 */
function clean(dateAsString) {
  // list of separators is from wikipedia https://www.wikiwand.com/en/Date_format_by_country
  // slash, point, dash or space
  return trim(dateAsString.replace(/[^\d-. /]/g, ''));
}

/**
 * To sanitize a date from IE11 handling
 *
 * @param {Date} date
 * @returns {string}
 */
function sanitizedDateTimeFormat(date) {
  const fDate = formatDate(date);
  return clean(fDate);
}

/**
 * To split a date into days, months, years, etc
 *
 * @param {string} dateAsString
 * @returns {ArrayLike.<string> | null}
 */
function splitDate(dateAsString) {
  return dateAsString.match(/(\d{1,4})([^\d]+)(\d{1,4})([^\d]+)(\d{1,4})/);
}

/**
 * To compute the localized date format
 * @returns {string}
 */
function getDateFormatBasedOnLocale() {
  /**
   *
   * @param {ArrayLike.<string>} dateParts
   * @returns {string[]}
   */
  function computePositions(dateParts) {
    /**
     * @param {number} index
     * @returns {string}
     */
    function getPartByIndex(index) {
      /** @type {Object.<string,string>} */
      const template = {
        2012: 'year',
        12: 'month',
        20: 'day',
      };
      const key = dateParts[index];
      return template[key];
    }

    return [1, 3, 5].map(getPartByIndex);
  }

  // Arbitrary date with different values for year,month,day
  const date = new Date();
  date.setDate(20);
  date.setMonth(11);
  date.setFullYear(2012);

  // Strange characters added by IE11 need to be taken into account here
  const formattedDate = sanitizedDateTimeFormat(date);

  // For Dutch locale, dateParts would match: [ 1:'20', 2:'-', 3:'12', 4:'-', 5:'2012' ]
  const dateParts = splitDate(formattedDate);

  const dateFormat = {};
  if (dateParts) {
    dateFormat.positions = computePositions(dateParts);
  }
  return `${dateFormat.positions[0]}-${dateFormat.positions[1]}-${dateFormat.positions[2]}`;
}

/**
 * @param {string[]} months
 */
function forceShortMonthNamesForEnGb(months) {
  if (months[8] === 'Sept') {
    // eslint-disable-next-line no-param-reassign
    months[8] = 'Sep';
  }
  return months;
}

/** @type {Object.<string, Object.<string,string[]>>} */
const monthsLocaleCache = {};

/**
 * @desc Returns month names for locale
 * @param {Object} [options]
 * @param {string} [options.locale] locale
 * @param {string} [options.style=long] long, short or narrow
 * @returns {string[]} like: ['January', 'February', ...etc].
 */
function getMonthNames({ locale, style = 'long' } = {}) {
  let months = monthsLocaleCache[locale] && monthsLocaleCache[locale][style];

  if (months) {
    return months;
  }

  months = [];

  const formatter = new Intl.DateTimeFormat(locale, { month: style });
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(2019, i, 1);
    const formattedDate = formatter.format(date);
    const normalizedDate = normalizeIntlDate(formattedDate);
    months.push(normalizedDate);
  }
  if (locale === 'en-GB' && style === 'short') {
    months = forceShortMonthNamesForEnGb(months);
  }
  monthsLocaleCache[locale] = monthsLocaleCache[locale] || {};
  monthsLocaleCache[locale][style] = months;

  return months;
}

/** @type {Object.<string, Object.<string,string[]>>} */
const weekdayNamesCache = {};

/**
 * @desc Return cached weekday names for locale for all styles ('long', 'short', 'narrow')
 * @param {string} locale locale
 * @returns {Object.<string,string[]>} - like { long: ['Sunday', 'Monday'...], short: ['Sun', ...], narrow: ['S', ...] }
 */
function getCachedWeekdayNames(locale) {
  const cachedWeekdayNames = weekdayNamesCache[locale];
  let weekdays;

  if (cachedWeekdayNames) {
    return cachedWeekdayNames;
  }

  weekdayNamesCache[locale] = {
    long: [],
    short: [],
    narrow: [],
  };

  ['long', 'short', 'narrow'].forEach(style => {
    weekdays = weekdayNamesCache[locale][style];
    const formatter = new Intl.DateTimeFormat(locale, {
      weekday: style,
    });

    const date = new Date('2019/04/07'); // start from Sunday
    for (let i = 0; i < 7; i += 1) {
      const weekday = formatter.format(date);
      const normalizedWeekday = normalizeIntlDate(weekday);
      weekdays.push(normalizedWeekday);
      date.setDate(date.getDate() + 1);
    }
  });

  return weekdayNamesCache[locale];
}

/**
 * @desc Returns weekday names for locale
 * @param {Object} [options]
 * @param {string} [options.locale] locale
 * @param {string} [options.style=long] long, short or narrow
 * @param {number} [options.firstDayOfWeek=0] 0 (Sunday), 1 (Monday), etc...
 * @returns {string[]} like: ['Sunday', 'Monday', 'Tuesday', ...etc].
 */
function getWeekdayNames({ locale, style = 'long', firstDayOfWeek = 0 } = {}) {
  const weekdays = getCachedWeekdayNames(locale)[style];
  const orderedWeekdays = [];
  for (let i = firstDayOfWeek; i < firstDayOfWeek + 7; i += 1) {
    orderedWeekdays.push(weekdays[i % 7]);
  }
  return orderedWeekdays;
}

/**
 * @desc Makes suitable for date comparisons
 * @param {Date} date
 * @returns {Date}
 */
function normalizeDateTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * To get the absolute value of a number.
 *
 * @param  {string} n - number in string format
 * @returns {string}
 */
function pad(n) {
  const digitRegex = /^\d+$/;
  const v = digitRegex.test(String(n)) ? Math.abs(Number(n)) : n;
  return String(v < 10 ? `0${v}` : v);
}

/**
 * To add a leading zero to a single number
 *
 * @param {string} dateString
 * @returns {string}
 */
function addLeadingZero(dateString) {
  const dateParts = splitDate(dateString);
  const delimiter = dateParts ? dateParts[2] : '';
  const dateArray =
    dateString.split && dateString.split(delimiter).filter(str => str.trim().length > 0);
  if (!dateArray || dateArray.length !== 3) {
    // prevent fail on invalid dates
    return '';
  }
  return dateArray.map(pad).join('-');
}

/**
 * @param {function} fn
 */
const memoize = fn => {
  /** @type {Object.<any, any>} */
  const cache = {};

  return /** @param {any} parm */ parm => {
    const n = parm;
    if (n in cache) {
      return cache[n];
    }
    const result = fn(n);
    cache[n] = result;
    return result;
  };
};

const memoizedGetDateFormatBasedOnLocale = memoize(getDateFormatBasedOnLocale);

/**
 * To parse a date into the right format
 *
 * @param {string} dateString
 * @returns {Date | undefined}
 */
function parseDate(dateString) {
  const stringToParse = addLeadingZero(dateString);
  let parsedString;

  switch (memoizedGetDateFormatBasedOnLocale(localize.locale)) {
    case 'day-month-year':
      parsedString = `${stringToParse.slice(6, 10)}/${stringToParse.slice(
        3,
        5,
      )}/${stringToParse.slice(0, 2)}`;
      break;
    case 'month-day-year':
      parsedString = `${stringToParse.slice(6, 10)}/${stringToParse.slice(
        0,
        2,
      )}/${stringToParse.slice(3, 5)}`;
      break;
    case 'year-month-day':
      parsedString = `${stringToParse.slice(0, 4)}/${stringToParse.slice(
        5,
        7,
      )}/${stringToParse.slice(8, 10)}`;
      break;
    default:
      parsedString = '0000/00/00';
  }

  const [year, month, day] = parsedString.split('/').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  // Check if parsedDate is not `Invalid Date` or that the date has changed (e.g. the not existing 31.02.2020)
  if (
    year > 0 &&
    month > 0 &&
    day > 0 &&
    parsedDate.getDate() === day &&
    parsedDate.getMonth() === month - 1
  ) {
    return parsedDate;
  }
  return undefined;
}

/**
 * @typedef {import('../types/LocalizeMixinTypes').LocalizeMixin} LocalizeMixin
 */

/**
 * # LocalizeMixin - for self managed templates
 * @type {LocalizeMixin}
 */
const LocalizeMixinImplementation = superclass =>
  // eslint-disable-next-line
  class LocalizeMixin extends superclass {
    /**
     * @returns {Object.<string,function>[]}
     */
    static get localizeNamespaces() {
      return [];
    }

    /**
     * @returns {boolean}
     */
    static get waitForLocalizeNamespaces() {
      return true;
    }

    constructor() {
      super();

      this.__boundLocalizeOnLocaleChanged =
        /** @param {...Object} args */
        (...args) => {
          const event = /** @type {CustomEvent} */ (Array.from(args)[0]);
          this.__localizeOnLocaleChanged(event);
        };

      // should be loaded in advance
      this.__localizeStartLoadingNamespaces();

      if (this.localizeNamespacesLoaded) {
        this.localizeNamespacesLoaded.then(() => {
          this.__localizeMessageSync = true;
        });
      }
    }

    /**
     * hook into LitElement to only render once all translations are loaded
     * @returns {Promise.<void>}
     */
    async performUpdate() {
      if (Object.getPrototypeOf(this).constructor.waitForLocalizeNamespaces) {
        await this.localizeNamespacesLoaded;
      }
      super.performUpdate();
    }

    connectedCallback() {
      if (super.connectedCallback) {
        super.connectedCallback();
      }

      if (this.localizeNamespacesLoaded) {
        this.localizeNamespacesLoaded.then(() => this.onLocaleReady());
      }
      this.__localizeAddLocaleChangedListener();
    }

    disconnectedCallback() {
      if (super.disconnectedCallback) {
        super.disconnectedCallback();
      }

      this.__localizeRemoveLocaleChangedListener();
    }

    /**
     * @param {string | string[]} keys
     * @param {Object.<string,?>} variables
     * @param {Object} [options]
     * @param {string} [options.locale]
     * @return {string | function}
     */
    msgLit(keys, variables, options) {
      if (this.__localizeMessageSync) {
        return localize.msg(keys, variables, options);
      }

      if (!this.localizeNamespacesLoaded) {
        return '';
      }

      return until(
        this.localizeNamespacesLoaded.then(() => localize.msg(keys, variables, options)),
        nothing,
      );
    }

    /**
     * @returns {string[]}
     */
    __getUniqueNamespaces() {
      /** @type {string[]} */
      const uniqueNamespaces = [];

      // IE11 does not support iterable in the constructor
      const s = new Set();
      Object.getPrototypeOf(this).constructor.localizeNamespaces.forEach(s.add.bind(s));
      s.forEach(uniqueNamespace => {
        uniqueNamespaces.push(uniqueNamespace);
      });
      return uniqueNamespaces;
    }

    __localizeStartLoadingNamespaces() {
      this.localizeNamespacesLoaded = localize.loadNamespaces(this.__getUniqueNamespaces());
    }

    __localizeAddLocaleChangedListener() {
      localize.addEventListener('localeChanged', this.__boundLocalizeOnLocaleChanged);
    }

    __localizeRemoveLocaleChangedListener() {
      localize.removeEventListener('localeChanged', this.__boundLocalizeOnLocaleChanged);
    }

    /**
     * @param {CustomEvent} event
     */
    __localizeOnLocaleChanged(event) {
      this.onLocaleChanged(event.detail.newLocale, event.detail.oldLocale);
    }

    onLocaleReady() {
      this.onLocaleUpdated();
    }

    /**
     * @param {string} newLocale
     * @param {string} oldLocale
     */
    // eslint-disable-next-line no-unused-vars
    onLocaleChanged(newLocale, oldLocale) {
      this.__localizeStartLoadingNamespaces();
      this.onLocaleUpdated();
      this.requestUpdate();
    }

    // eslint-disable-next-line class-methods-use-this
    onLocaleUpdated() {}
  };

const LocalizeMixin = dedupeMixin(LocalizeMixinImplementation);

// TODO: still needed? It can be solved with while loop as well

/**
 * Use the `.add` method to add async functions to the queue
 * Await the `.complete` if you want to ensure the queue is empty at any point
 * `complete` resolves whenever no more tasks are running.
 * Important note: Currently runs tasks 1 by 1, there is no concurrency option at the moment
 */
class AsyncQueue {
  constructor() {
    this.__running = false;
    /** @type {function[]} */
    this.__queue = [];
  }

  /**
   *
   * @param {function} task
   */
  add(task) {
    this.__queue.push(task);
    if (!this.__running) {
      // We have a new queue, because before there was nothing in the queue
      this.complete = new Promise(resolve => {
        /** @type {function} */
        this.__callComplete = resolve;
      });
      this.__run();
    }
  }

  async __run() {
    this.__running = true;
    await this.__queue[0]();
    this.__queue.shift();
    if (this.__queue.length > 0) {
      this.__run();
    } else {
      this.__running = false;
      if (this.__callComplete) {
        this.__callComplete();
      }
    }
  }
}

/**
 * Return PascalCased version of the camelCased string
 *
 * @param {string} str
 * @return {string}
 */
function pascalCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// TODO: will be moved to @Lion/core later?

/**
 * @typedef {import('../../types/utils/SyncUpdatableMixinTypes').SyncUpdatableMixin} SyncUpdatableMixin
 * @typedef {import('../../types/utils/SyncUpdatableMixinTypes').SyncUpdatableNamespace} SyncUpdatableNamespace
 */

/**
 * @desc Why this mixin?
 * - it adheres to the "Member Order Independence" web components standard:
 * https://github.com/webcomponents/gold-standard/wiki/Member-Order-Independence
 * - sync observers can be dependent on the outcome of the render function (or, more generically
 * speaking, the light and shadow dom). This aligns with the 'updated' callback that is supported
 * out of the box by LitElement, which runs after connectedCallback as well.
 * - makes the propertyAccessor.`hasChanged` compatible in synchronous updates:
 * `updateSync` will only be called when new value differs from old value.
 * See: https://lit-element.polymer-project.org/guide/lifecycle#haschanged
 * - it is a stable abstraction on top of a protected/non official lifecycle LitElement api.
 * Whenever the implementation of `requestUpdateInternal` changes (this happened in the past for
 * `requestUpdate`) we only have to change our abstraction instead of all our components
 * @type {SyncUpdatableMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<import('@lion/core').LitElement>} superclass
 */
const SyncUpdatableMixinImplementation = superclass =>
  class extends superclass {
    constructor() {
      super();
      // Namespace for this mixin that guarantees naming clashes will not occur...
      /**
       * @type {SyncUpdatableNamespace}
       */
      this.__SyncUpdatableNamespace = {};
    }

    /** @param {import('@lion/core').PropertyValues } changedProperties */
    firstUpdated(changedProperties) {
      super.firstUpdated(changedProperties);
      this.__SyncUpdatableNamespace.connected = true;
      this.__syncUpdatableInitialize();
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this.__SyncUpdatableNamespace.connected = false;
    }

    /**
     * Makes the propertyAccessor.`hasChanged` compatible in synchronous updates
     * @param {string} name
     * @param {*} newValue
     * @param {*} oldValue
     */
    static __syncUpdatableHasChanged(name, newValue, oldValue) {
      // @ts-expect-error accessing private lit property
      const properties = this._classProperties;
      if (properties.get(name) && properties.get(name).hasChanged) {
        return properties.get(name).hasChanged(newValue, oldValue);
      }
      return newValue !== oldValue;
    }

    __syncUpdatableInitialize() {
      const ns = this.__SyncUpdatableNamespace;
      const ctor = /** @type {typeof SyncUpdatableMixin & typeof import('../../types/utils/SyncUpdatableMixinTypes').SyncUpdatableHost} */ (this
        .constructor);

      ns.initialized = true;
      // Empty queue...
      if (ns.queue) {
        Array.from(ns.queue).forEach(name => {
          if (ctor.__syncUpdatableHasChanged(name, this[name], undefined)) {
            this.updateSync(name, undefined);
          }
        });
      }
    }

    /**
     * @param {string} name
     * @param {*} oldValue
     */
    requestUpdateInternal(name, oldValue) {
      super.requestUpdateInternal(name, oldValue);

      this.__SyncUpdatableNamespace = this.__SyncUpdatableNamespace || {};
      const ns = this.__SyncUpdatableNamespace;

      const ctor = /** @type {typeof SyncUpdatableMixin & typeof import('../../types/utils/SyncUpdatableMixinTypes').SyncUpdatableHost} */ (this
        .constructor);

      // Before connectedCallback: queue
      if (!ns.connected) {
        ns.queue = ns.queue || new Set();
        // Makes sure that we only initialize one time, with most up to date value
        ns.queue.add(name);
      } // After connectedCallback: guarded proxy to updateSync
      else if (ctor.__syncUpdatableHasChanged(name, this[name], oldValue)) {
        this.updateSync(name, oldValue);
      }
    }

    /**
     * @desc A public abstraction that has the exact same api as `requestUpdateInternal`.
     * All code previously present in requestUpdateInternal can be placed in this method.
     * @param {string} name
     * @param {*} oldValue
     */
    updateSync(name, oldValue) {} // eslint-disable-line class-methods-use-this, no-unused-vars
  };

const SyncUpdatableMixin = dedupeMixin(SyncUpdatableMixinImplementation);

/**
 * @typedef {import('../validate/Validator').Validator} Validator
 * @typedef {import('@lion/core').TemplateResult} TemplateResult
 * @typedef {Object} messageMap
 * @property {string | Node} message
 * @property {string} type
 * @property {Validator} [validator]
 */

/**
 * @desc Takes care of accessible rendering of error messages
 * Should be used in conjunction with FormControl having ValidateMixin applied
 */
class LionValidationFeedback extends LitElement {
  static get properties() {
    return {
      feedbackData: { attribute: false },
    };
  }

  /**
   * @overridable
   * @param {Object} opts
   * @param {string | Node | TemplateResult } opts.message message or feedback node or TemplateResult
   * @param {string} [opts.type]
   * @param {Validator} [opts.validator]
   */
  // eslint-disable-next-line class-methods-use-this
  _messageTemplate({ message }) {
    return message;
  }

  /**
   * @param {import('@lion/core').PropertyValues } changedProperties
   */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (this.feedbackData && this.feedbackData[0]) {
      this.setAttribute('type', this.feedbackData[0].type);
      this.currentType = this.feedbackData[0].type;
      window.clearTimeout(this.removeMessage);
      if (this.currentType === 'success') {
        this.removeMessage = window.setTimeout(() => {
          this.removeAttribute('type');
          /** @type {messageMap[]} */
          this.feedbackData = [];
        }, 3000);
      }
    } else if (this.currentType !== 'success') {
      this.removeAttribute('type');
    }
  }

  render() {
    return html`
      ${this.feedbackData &&
      this.feedbackData.map(
        ({ message, type, validator }) => html`
          ${this._messageTemplate({ message, type, validator })}
        `,
      )}
    `;
  }
}

/**
 * @typedef {object} MessageData
 * @property {*} [MessageData.modelValue]
 * @property {string} [MessageData.fieldName]
 * @property {HTMLElement} [MessageData.formControl]
 * @property {string} [MessageData.type]
 * @property {Object.<string,?>} [MessageData.config]
 * @property {string} [MessageData.name]
 */

class Validator {
  /**
   *
   * @param {?} [param]
   * @param {Object.<string,?>} [config]
   */
  constructor(param, config) {
    this.__fakeExtendsEventTarget();

    /** @type {?} */
    this.__param = param;

    /** @type {Object.<string,?>} */
    this.__config = config || {};
    this.type = (config && config.type) || 'error'; // Default type supported by ValidateMixin
  }

  static get validatorName() {
    return '';
  }

  static get async() {
    return false;
  }

  /**
   * @desc The function that returns a Boolean
   * @param {?} [modelValue]
   * @param {?} [param]
   * @param {{}} [config]
   * @returns {Boolean|Promise<Boolean>}
   */
  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  execute(modelValue, param, config) {
    const ctor = /** @type {typeof Validator} */ (this.constructor);
    if (!ctor.validatorName) {
      throw new Error(
        'A validator needs to have a name! Please set it via "static get validatorName() { return \'IsCat\'; }"',
      );
    }
    return true;
  }

  set param(p) {
    this.__param = p;
    if (this.dispatchEvent) {
      this.dispatchEvent(new Event('param-changed'));
    }
  }

  get param() {
    return this.__param;
  }

  set config(c) {
    this.__config = c;
    if (this.dispatchEvent) {
      this.dispatchEvent(new Event('config-changed'));
    }
  }

  get config() {
    return this.__config;
  }

  /**
   * @overridable
   * @param {MessageData} [data]
   * @returns {Promise<string|Node>}
   */
  async _getMessage(data) {
    const ctor = /** @type {typeof Validator} */ (this.constructor);
    const composedData = {
      name: ctor.validatorName,
      type: this.type,
      params: this.param,
      config: this.config,
      ...data,
    };
    if (this.config.getMessage) {
      if (typeof this.config.getMessage === 'function') {
        return this.config.getMessage(composedData);
      }
      throw new Error(
        `You must provide a value for getMessage of type 'function', you provided a value of type: ${typeof this
          .config.getMessage}`,
      );
    }
    return ctor.getMessage(composedData);
  }

  /**
   * @overridable
   * @param {MessageData} [data]
   * @returns {Promise<string|Node>}
   */
  // eslint-disable-next-line no-unused-vars
  static async getMessage(data) {
    return `Please configure an error message for "${this.name}" by overriding "static async getMessage()"`;
  }

  /**
   * @param {HTMLElement} formControl
   */
  onFormControlConnect(formControl) {} // eslint-disable-line

  /**
   * @param {HTMLElement} formControl
   */
  onFormControlDisconnect(formControl) {} // eslint-disable-line

  /**
   * @desc Used on async Validators, makes it able to do perf optimizations when there are
   * pending "execute" calls with outdated values.
   * ValidateMixin calls Validator.abortExecution() an async Validator can act accordingly,
   * depending on its implementation of the "execute" function.
   * - For instance, when fetch was called:
   * https://stackoverflow.com/questions/31061838/how-do-i-cancel-an-http-fetch-request
   * - Or, when a webworker was started, its process could be aborted and then restarted.
   */
  abortExecution() {} // eslint-disable-line

  __fakeExtendsEventTarget() {
    const delegate = document.createDocumentFragment();

    /**
     *
     * @param {string} type
     * @param {EventListener} listener
     * @param {Object} [opts]
     */
    const delegatedAddEventListener = (type, listener, opts) =>
      delegate.addEventListener(type, listener, opts);

    /**
     * @param {string} type
     * @param {EventListener} listener
     * @param {Object} [opts]
     */
    const delegatedRemoveEventListener = (type, listener, opts) =>
      delegate.removeEventListener(type, listener, opts);

    /**
     * @param {Event|CustomEvent} event
     */
    const delegatedDispatchEvent = event => delegate.dispatchEvent(event);

    this.addEventListener = delegatedAddEventListener;

    this.removeEventListener = delegatedRemoveEventListener;

    this.dispatchEvent = delegatedDispatchEvent;
  }
}

// For simplicity, a default validator only handles one state:
// it can either be true or false an it will only have one message.
// In more advanced cases (think of the feedback mechanism for the maximum number of
// characters in Twitter), more states are needed. The alternative of
// having multiple distinct validators would be cumbersome to create and maintain,
// also because the validations would tie too much into each others logic.

/**
 * @desc Instead of evaluating the result of a regular validator, a ResultValidator looks
 * at the total result of regular Validators. Instead of an execute function, it uses a
 * 'executeOnResults' Validator.
 * ResultValidators cannot be async, and should not contain an execute method.
 */
class ResultValidator extends Validator {
  /**
   * @param {Object} context
   * @param {Validator[]} context.regularValidationResult
   * @param {Validator[]} context.prevValidationResult
   * @param {Validator[]} context.prevShownValidationResult
   * @param {Validator[]} [context.validators]
   * @returns {boolean}
   */
  /* eslint-disable no-unused-vars */
  // eslint-disable-next-line class-methods-use-this
  executeOnResults({
    regularValidationResult,
    prevValidationResult,
    prevShownValidationResult,
    validators,
  }) {
    /* eslint-enable no-unused-vars */
    return true;
  }
}

/**
 * @typedef {import('../../../types/FormControlMixinTypes.js').FormControlHost} FormControlHost
 */

class Required extends Validator {
  static get validatorName() {
    return 'Required';
  }

  /**
   * We don't have an execute function, since the Required validator is 'special'.
   * The outcome depends on the modelValue of the FormControl and
   * FormControl.__isEmpty / FormControl._isEmpty.
   */

  /**
   * @param {FormControlHost & HTMLElement} formControl
   */
  // eslint-disable-next-line class-methods-use-this
  onFormControlConnect(formControl) {
    if (formControl._inputNode) {
      formControl._inputNode.setAttribute('aria-required', 'true');
    }
  }

  /**
   * @param {FormControlHost & HTMLElement} formControl
   */
  // eslint-disable-next-line class-methods-use-this
  onFormControlDisconnect(formControl) {
    if (formControl._inputNode) {
      formControl._inputNode.removeAttribute('aria-required');
    }
  }
}

/* eslint-disable class-methods-use-this, camelcase, no-param-reassign, max-classes-per-file */

/**
 * @typedef {import('../../types/validate/ValidateMixinTypes').ValidateMixin} ValidateMixin
 */

/**
 * @param {any[]} array1
 * @param {any[]} array2
 */
function arrayDiff(array1 = [], array2 = []) {
  return array1.filter(x => !array2.includes(x)).concat(array2.filter(x => !array1.includes(x)));
}

/**
 * @desc Handles all validation, based on modelValue changes. It has no knowledge about dom and
 * UI. All error visibility, dom interaction and accessibility are handled in FeedbackMixin.
 *
 * @type {ValidateMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<import('@lion/core').LitElement>} superclass
 */
const ValidateMixinImplementation = superclass =>
  class extends FormControlMixin(
    SyncUpdatableMixin(DisabledMixin(SlotMixin(ScopedElementsMixin(superclass)))),
  ) {
    static get scopedElements() {
      const scopedElementsCtor = /** @type {typeof import('@open-wc/scoped-elements/src/types').ScopedElementsHost} */ (super
        .constructor);
      return {
        ...scopedElementsCtor.scopedElements,
        'lion-validation-feedback': LionValidationFeedback,
      };
    }

    /** @type {any} */
    static get properties() {
      return {
        validators: { attribute: false },

        hasFeedbackFor: { attribute: false },

        shouldShowFeedbackFor: { attribute: false },

        showsFeedbackFor: {
          type: Array,
          attribute: 'shows-feedback-for',
          reflect: true,
          converter: {
            fromAttribute: /** @param {string} value */ value => value.split(','),
            toAttribute: /** @param {[]} value */ value => value.join(','),
          },
        },

        validationStates: { attribute: false },

        /**
         * @desc flag that indicates whether async validation is pending
         */
        isPending: {
          type: Boolean,
          attribute: 'is-pending',
          reflect: true,
        },

        /**
         * @desc specialized fields (think of input-date and input-email) can have preconfigured
         * validators.
         */
        defaultValidators: { attribute: false },

        /**
         * Subclassers can enable this to show multiple feedback messages at the same time
         * By default, just like the platform, only one message (with highest prio) is visible.
         */
        _visibleMessagesAmount: { attribute: false },
      };
    }

    /**
     * @overridable
     */
    static get validationTypes() {
      return ['error'];
    }

    /**
     * @overridable
     * Adds "._feedbackNode" as described below
     */
    get slots() {
      /**
       * FIXME: Ugly workaround https://github.com/microsoft/TypeScript/issues/40110
       * @callback getScopedTagName
       * @param {string} tagName
       * @returns {string}
       *
       * @typedef {Object} ScopedElementsObj
       * @property {getScopedTagName} getScopedTagName
       */
      const ctor = /** @type {typeof ValidateMixin & ScopedElementsObj} */ (this.constructor);
      return {
        ...super.slots,
        feedback: () => {
          const feedbackEl = document.createElement(
            ctor.getScopedTagName('lion-validation-feedback'),
          );
          feedbackEl.setAttribute('data-tag-name', 'lion-validation-feedback');
          return feedbackEl;
        },
      };
    }

    get _allValidators() {
      return [...this.validators, ...this.defaultValidators];
    }

    constructor() {
      super();

      /** @type {string[]} */
      this.hasFeedbackFor = [];

      /** @type {string[]} */
      this.shouldShowFeedbackFor = [];

      /** @type {string[]} */
      this.showsFeedbackFor = [];

      /** @type {Object.<string, Object.<string, boolean>>} */
      this.validationStates = {};

      this._visibleMessagesAmount = 1;

      this.isPending = false;

      /** @type {Validator[]} */
      this.validators = [];
      /** @type {Validator[]} */
      this.defaultValidators = [];

      /** @type {Validator[]} */
      this.__syncValidationResult = [];

      /** @type {Validator[]} */
      this.__asyncValidationResult = [];

      /**
       * @desc contains results from sync Validators, async Validators and ResultValidators
       * @type {Validator[]}
       */
      this.__validationResult = [];
      /** @type {Validator[]} */
      this.__prevValidationResult = [];
      /** @type {Validator[]} */
      this.__prevShownValidationResult = [];

      this.__onValidatorUpdated = this.__onValidatorUpdated.bind(this);
      this._updateFeedbackComponent = this._updateFeedbackComponent.bind(this);
    }

    connectedCallback() {
      super.connectedCallback();
      localize.addEventListener('localeChanged', this._updateFeedbackComponent);
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      localize.removeEventListener('localeChanged', this._updateFeedbackComponent);
    }

    /**
     * @param {import('@lion/core').PropertyValues} changedProperties
     */
    firstUpdated(changedProperties) {
      super.firstUpdated(changedProperties);
      this.__validateInitialized = true;
      this.validate();
    }

    /**
     * @param {string} name
     * @param {?} oldValue
     */
    updateSync(name, oldValue) {
      super.updateSync(name, oldValue);
      if (name === 'validators') {
        // trigger validation (ideally only for the new or changed validator)
        this.__setupValidators();
        this.validate({ clearCurrentResult: true });
      } else if (name === 'modelValue') {
        this.validate({ clearCurrentResult: true });
      }

      if (
        [
          'touched',
          'dirty',
          'prefilled',
          'focused',
          'submitted',
          'hasFeedbackFor',
          'filled',
        ].includes(name)
      ) {
        this._updateShouldShowFeedbackFor();
      }

      if (name === 'showsFeedbackFor') {
        // This can't be reflected asynchronously in Safari
        // Screen reader output should be in sync with visibility of error messages
        if (this._inputNode) {
          this._inputNode.setAttribute('aria-invalid', `${this._hasFeedbackVisibleFor('error')}`);
          // this._inputNode.setCustomValidity(this._validationMessage || '');
        }

        const diff = arrayDiff(this.showsFeedbackFor, oldValue);
        if (diff.length > 0) {
          this.dispatchEvent(new Event(`showsFeedbackForChanged`, { bubbles: true }));
        }
        diff.forEach(type => {
          this.dispatchEvent(
            new Event(`showsFeedbackFor${pascalCase(type)}Changed`, { bubbles: true }),
          );
        });
      }

      if (name === 'shouldShowFeedbackFor') {
        const diff = arrayDiff(this.shouldShowFeedbackFor, oldValue);
        if (diff.length > 0) {
          this.dispatchEvent(new Event(`shouldShowFeedbackForChanged`, { bubbles: true }));
        }
      }
    }

    /**
     * @desc The main function of this mixin. Triggered by:
     *  - a modelValue change
     *  - a change in the 'validators' array
     * -  a change in the config of an individual Validator
     *
     * Three situations are handled:
     * - A.1 The FormControl is empty: further execution is halted. When the Required Validator
     * (being mutually exclusive to the other Validators) is applied, it will end up in the
     * validation result (as the only Validator, since further execution was halted).
     * - A.2 There are synchronous Validators: this is the most common flow. When modelValue hasn't
     * changed since last async results were generated, 'sync results' are merged with the
     * 'async results'.
     * - A.3 There are asynchronous Validators: for instance when server side evaluation is needed.
     * Executions are scheduled and awaited and the 'async results' are merged with the
     * 'sync results'.
     *
     * - B. There are ResultValidators. After steps A.1, A.2, or A.3 are finished, the holistic
     * ResultValidators (evaluating the total result of the 'regular' (A.1, A.2 and A.3) validators)
     * will be run...
     *
     * Situations A.2 and A.3 are not mutually exclusive and can be triggered within one validate()
     * call. Situation B will occur after every call.
     *
     * @param {{ clearCurrentResult?: boolean }} [opts]
     */
    async validate({ clearCurrentResult } = {}) {
      if (this.disabled) {
        this.__clearValidationResults();
        this.__finishValidation({ source: 'sync', hasAsync: true });
        this._updateFeedbackComponent();
        return;
      }
      if (!this.__validateInitialized) {
        return;
      }

      this.__prevValidationResult = this.__validationResult;
      if (clearCurrentResult) {
        // Clear ('invalidate') all pending and existing validation results.
        // This is needed because we have async (pending) validators whose results
        // need to be merged with those of sync validators and vice versa.
        this.__clearValidationResults();
      }
      await this.__executeValidators();
    }

    /**
     * @desc step A1-3 + B (as explained in 'validate')
     */
    async __executeValidators() {
      this.validateComplete = new Promise(resolve => {
        this.__validateCompleteResolve = resolve;
      });

      // When the modelValue can't be created by FormatMixin.parser, still allow all validators
      // to give valuable feedback to the user based on the current viewValue.
      const value =
        this.modelValue instanceof Unparseable ? this.modelValue.viewValue : this.modelValue;

      /** @type {Validator | undefined} */
      const requiredValidator = this._allValidators.find(v => v instanceof Required);

      /**
       * 1. Handle the 'exceptional' Required validator:
       * - the validatity is dependent on the formControl type and therefore determined
       * by the formControl.__isEmpty method. Basically, the Required Validator is a means
       * to trigger formControl.__isEmpty.
       * - when __isEmpty returns true, the input was empty. This means we need to stop
       * validation here, because all other Validators' execute functions assume the
       * value is not empty (there would be nothing to validate).
       */
      // TODO: Try to remove this when we have a single lion form core package, because then we can
      // depend on FormControlMixin directly, and _isEmpty will always be an existing method on the prototype then
      const isEmpty = this.__isEmpty(value);
      if (isEmpty) {
        if (requiredValidator) {
          this.__syncValidationResult = [requiredValidator];
        }
        this.__finishValidation({ source: 'sync' });
        return;
      }

      // Separate Validators in sync and async
      const /** @type {Validator[]} */ filteredValidators = this._allValidators.filter(
          v => !(v instanceof ResultValidator) && !(v instanceof Required),
        );
      const /** @type {Validator[]} */ syncValidators = filteredValidators.filter(v => {
          const vCtor = /** @type {typeof Validator} */ (v.constructor);
          return !vCtor.async;
        });
      const /** @type {Validator[]} */ asyncValidators = filteredValidators.filter(v => {
          const vCtor = /** @type {typeof Validator} */ (v.constructor);
          return vCtor.async;
        });

      /**
       * 2. Synchronous validators
       */
      this.__executeSyncValidators(syncValidators, value, {
        hasAsync: Boolean(asyncValidators.length),
      });

      /**
       * 3. Asynchronous validators
       */
      await this.__executeAsyncValidators(asyncValidators, value);
    }

    /**
     * @desc step A2, calls __finishValidation
     * @param {Validator[]} syncValidators
     * @param {unknown} value
     * @param {{ hasAsync: boolean }} opts
     */
    __executeSyncValidators(syncValidators, value, { hasAsync }) {
      if (syncValidators.length) {
        this.__syncValidationResult = syncValidators.filter(v =>
          v.execute(value, v.param, { node: this }),
        );
      }
      this.__finishValidation({ source: 'sync', hasAsync });
    }

    /**
     * @desc step A3, calls __finishValidation
     * @param {Validator[]} asyncValidators all Validators except required and ResultValidators
     * @param {?} value
     */
    async __executeAsyncValidators(asyncValidators, value) {
      if (asyncValidators.length) {
        this.isPending = true;
        const resultPromises = asyncValidators.map(v => v.execute(value, v.param, { node: this }));
        const booleanResults = await Promise.all(resultPromises);
        this.__asyncValidationResult = booleanResults
          .map((r, i) => asyncValidators[i]) // Create an array of Validators
          .filter((v, i) => booleanResults[i]); // Only leave the ones returning true
        this.__finishValidation({ source: 'async' });
        this.isPending = false;
      }
    }

    /**
     * @desc step B, called by __finishValidation
     * @param {Validator[]} regularValidationResult result of steps 1-3
     */
    __executeResultValidators(regularValidationResult) {
      const resultValidators = /** @type {ResultValidator[]} */ (this._allValidators.filter(v => {
        const vCtor = /** @type {typeof Validator} */ (v.constructor);
        return !vCtor.async && v instanceof ResultValidator;
      }));

      return resultValidators.filter(v =>
        v.executeOnResults({
          regularValidationResult,
          prevValidationResult: this.__prevValidationResult,
          prevShownValidationResult: this.__prevShownValidationResult,
        }),
      );
    }

    /**
     * @param {object} options
     * @param {'sync'|'async'} options.source
     * @param {boolean} [options.hasAsync] whether async validators are configured in this run.
     * If not, we have nothing left to wait for.
     */
    __finishValidation({ source, hasAsync }) {
      const syncAndAsyncOutcome = [...this.__syncValidationResult, ...this.__asyncValidationResult];
      // if we have any ResultValidators left, now is the time to run them...
      const resultOutCome = this.__executeResultValidators(syncAndAsyncOutcome);

      this.__validationResult = [...resultOutCome, ...syncAndAsyncOutcome];
      // this._storeResultsOnInstance(this.__validationResult);

      const ctor = /** @type {typeof import('../../types/validate/ValidateMixinTypes').ValidateHost} */ (this
        .constructor);

      /** @type {Object.<string, Object.<string, boolean>>} */
      const validationStates = ctor.validationTypes.reduce(
        (acc, type) => ({ ...acc, [type]: {} }),
        {},
      );
      this.__validationResult.forEach(v => {
        if (!validationStates[v.type]) {
          validationStates[v.type] = {};
        }
        const vCtor = /** @type {typeof Validator} */ (v.constructor);
        validationStates[v.type][vCtor.validatorName] = true;
      });
      this.validationStates = validationStates;

      this.hasFeedbackFor = [...new Set(this.__validationResult.map(v => v.type))];

      /** private event that should be listened to by LionFieldSet */
      this.dispatchEvent(new Event('validate-performed', { bubbles: true }));
      if (source === 'async' || !hasAsync) {
        if (this.__validateCompleteResolve) {
          this.__validateCompleteResolve();
        }
      }
    }

    __clearValidationResults() {
      this.__syncValidationResult = [];
      this.__asyncValidationResult = [];
    }

    /**
     * @param {Event|CustomEvent} e
     */
    __onValidatorUpdated(e) {
      if (e.type === 'param-changed' || e.type === 'config-changed') {
        this.validate();
      }
    }

    __setupValidators() {
      const events = ['param-changed', 'config-changed'];
      if (this.__prevValidators) {
        this.__prevValidators.forEach(v => {
          events.forEach(e => {
            if (v.removeEventListener) {
              v.removeEventListener(e, this.__onValidatorUpdated);
            }
          });
          v.onFormControlDisconnect(this);
        });
      }
      this._allValidators.forEach(v => {
        if (!(v instanceof Validator)) {
          // throws in constructor are not visible to end user so we do both
          const errorType = Array.isArray(v) ? 'array' : typeof v;
          const errorMessage = `Validators array only accepts class instances of Validator. Type "${errorType}" found. This may be caused by having multiple installations of @lion/form-core.`;
          // eslint-disable-next-line no-console
          console.error(errorMessage, this);
          throw new Error(errorMessage);
        }
        const ctor = /** @type {typeof import('../../types/validate/ValidateMixinTypes').ValidateHost} */ (this
          .constructor);
        if (ctor.validationTypes.indexOf(v.type) === -1) {
          const vCtor = /** @type {typeof Validator} */ (v.constructor);
          // throws in constructor are not visible to end user so we do both
          const errorMessage = `This component does not support the validator type "${v.type}" used in "${vCtor.validatorName}". You may change your validators type or add it to the components "static get validationTypes() {}".`;
          // eslint-disable-next-line no-console
          console.error(errorMessage, this);
          throw new Error(errorMessage);
        }
        events.forEach(e => {
          if (v.addEventListener) {
            v.addEventListener(e, this.__onValidatorUpdated);
          }
        });
        v.onFormControlConnect(this);
      });
      this.__prevValidators = this._allValidators;
    }

    /**
     * @param {?} v
     */
    __isEmpty(v) {
      if (typeof this._isEmpty === 'function') {
        return this._isEmpty(v);
      }
      return (
        this.modelValue === null || typeof this.modelValue === 'undefined' || this.modelValue === ''
      );
    }

    // ------------------------------------------------------------------------------------------
    // -- Feedback specifics --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------------

    /**
     * @typedef {object} FeedbackMessage
     * @property {string | Node} message this
     * @property {string} type will be 'error' for messages from default Validators. Could be
     * 'warning', 'info' etc. for Validators with custom types. Needed as a directive for
     * feedbackNode how to render a message of a certain type
     * @property {Validator} [validator] when the message is directly coupled to a Validator
     * (in most cases), this property is filled. When a message is not coupled to a Validator
     * (in case of success feedback which is based on a diff or current and previous validation
     * results), this property can be left empty.
     */

    /**
     * @param {Validator[]} validators list of objects having a .getMessage method
     * @return {Promise.<FeedbackMessage[]>}
     */
    async __getFeedbackMessages(validators) {
      let fieldName = await this.fieldName;
      return Promise.all(
        validators.map(async validator => {
          if (validator.config.fieldName) {
            fieldName = await validator.config.fieldName;
          }
          const message = await validator._getMessage({
            modelValue: this.modelValue,
            formControl: this,
            fieldName,
          });
          return { message, type: validator.type, validator };
        }),
      );
    }

    /**
     * @desc Responsible for retrieving messages from Validators and
     * (delegation of) rendering them.
     *
     * For `._feedbackNode` (extension of LionValidationFeedback):
     * - retrieve messages from highest prio Validators
     * - provide the result to custom feedback node and let the
     * custom node decide on their renderings
     *
     * In both cases:
     * - we compute the 'show' flag (like 'hasErrorVisible') for all types
     * - we set the customValidity message of the highest prio Validator
     * - we set aria-invalid="true" in case hasErrorVisible is true
     */
    _updateFeedbackComponent() {
      const { _feedbackNode } = this;
      if (!_feedbackNode) {
        return;
      }

      if (!this.__feedbackQueue) {
        this.__feedbackQueue = new AsyncQueue();
      }

      if (this.showsFeedbackFor.length > 0) {
        this.__feedbackQueue.add(async () => {
          /** @type {Validator[]} */
          this.__prioritizedResult = this._prioritizeAndFilterFeedback({
            validationResult: this.__validationResult,
          });

          if (this.__prioritizedResult.length > 0) {
            this.__prevShownValidationResult = this.__prioritizedResult;
          }

          const messageMap = await this.__getFeedbackMessages(this.__prioritizedResult);
          _feedbackNode.feedbackData = messageMap.length ? messageMap : [];
        });
      } else {
        this.__feedbackQueue.add(async () => {
          _feedbackNode.feedbackData = [];
        });
      }
      this.feedbackComplete = this.__feedbackQueue.complete;
    }

    /**
     * Show the validity feedback when returning true, don't show when false
     *  @param {string} type
     */
    // eslint-disable-next-line no-unused-vars
    _showFeedbackConditionFor(type) {
      return true;
    }

    /**
     * @param {string} type
     */
    _hasFeedbackVisibleFor(type) {
      return (
        this.hasFeedbackFor &&
        this.hasFeedbackFor.includes(type) &&
        this.shouldShowFeedbackFor &&
        this.shouldShowFeedbackFor.includes(type)
      );
    }

    /** @param {import('@lion/core').PropertyValues} changedProperties */
    updated(changedProperties) {
      super.updated(changedProperties);

      if (
        changedProperties.has('shouldShowFeedbackFor') ||
        changedProperties.has('hasFeedbackFor')
      ) {
        const ctor = /** @type {typeof import('../../types/validate/ValidateMixinTypes').ValidateHost} */ (this
          .constructor);
        // Necessary typecast because types aren't smart enough to understand that we filter out undefined
        this.showsFeedbackFor = /** @type {string[]} */ (ctor.validationTypes
          .map(type => (this._hasFeedbackVisibleFor(type) ? type : undefined))
          .filter(_ => !!_));
        this._updateFeedbackComponent();
      }
    }

    _updateShouldShowFeedbackFor() {
      const ctor = /** @type {typeof import('../../types/validate/ValidateMixinTypes').ValidateHost} */ (this
        .constructor);

      // Necessary typecast because types aren't smart enough to understand that we filter out undefined
      const newShouldShowFeedbackFor = /** @type {string[]} */ (ctor.validationTypes
        .map(type => (this._showFeedbackConditionFor(type) ? type : undefined))
        .filter(_ => !!_));

      if (JSON.stringify(this.shouldShowFeedbackFor) !== JSON.stringify(newShouldShowFeedbackFor)) {
        this.shouldShowFeedbackFor = newShouldShowFeedbackFor;
      }
    }

    /**
     * @overridable
     * @desc Orders all active validators in this.__validationResult. Can
     * also filter out occurrences (based on interaction states)
     * @param {{ validationResult: Validator[] }} opts
     * @return {Validator[]} ordered list of Validators with feedback messages visible to the
     * end user
     */
    _prioritizeAndFilterFeedback({ validationResult }) {
      const ctor = /** @type {typeof import('../../types/validate/ValidateMixinTypes').ValidateHost} */ (this
        .constructor);
      const types = ctor.validationTypes;
      // Sort all validators based on the type provided.
      const res = validationResult
        .filter(v => this._showFeedbackConditionFor(v.type))
        .sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type));
      return res.slice(0, this._visibleMessagesAmount);
    }
  };

const ValidateMixin = dedupeMixin(ValidateMixinImplementation);

/* eslint-disable class-methods-use-this */

/**
 * @typedef {import('../types/FormatMixinTypes').FormatMixin} FormatMixin
 * @typedef {import('@lion/localize/types/LocalizeMixinTypes').FormatNumberOptions} FormatOptions
 * @typedef {import('../types/FormControlMixinTypes.js').ModelValueEventDetails} ModelValueEventDetails
 */

// For a future breaking release:
// - do not allow the private `.formattedValue` as property that can be set to
// trigger a computation loop.
// - do not fire events for those private and protected concepts
// - simplify _calculateValues: recursive trigger lock can be omitted, since need for connecting
// the loop via sync observers is not needed anymore.
// - consider `formatOn` as an overridable function, by default something like:
// `(!__isHandlingUserInput || !hasError) && !focused`
// This would allow for more advanced scenarios, like formatting an input whenever it becomes valid.
// This would make formattedValue as a concept obsolete, since for maximum flexibility, the
// formattedValue condition needs to be evaluated right before syncing back to the view

/**
 * @desc Designed to be applied on top of a LionField.
 * To understand all concepts within the Mixin, please consult the flow diagram in the
 * documentation.
 *
 * ## Flows
 * FormatMixin supports these two main flows:
 * [1] Application Developer sets `.modelValue`:
 *     Flow: `.modelValue` (formatter) -> `.formattedValue` -> `._inputNode.value`
 *                         (serializer) -> `.serializedValue`
 * [2] End user interacts with field:
 *     Flow: `@user-input-changed` (parser) -> `.modelValue` (formatter) -> `.formattedValue` - (debounce till reflect condition (formatOn) is met) -> `._inputNode.value`
 *                                 (serializer) -> `.serializedValue`
 *
 * For backwards compatibility with the platform, we also support `.value` as an api. In that case
 * the flow will be like [2], without the debounce.
 *
 * ## Difference between value, viewValue and formattedValue
 * A viewValue is a concept rather than a property. To be compatible with the platform api, the
 * property for the concept of viewValue is thus called `.value`.
 * When reading code and docs, one should be aware that the term viewValue is mostly used, but the
 * terms can be used interchangeably.
 * The `.formattedValue` should be seen as the 'scheduled' viewValue. It is computed realtime and
 * stores the output of formatter. It will replace viewValue. once condition `formatOn` is met.
 * Another difference is that formattedValue lives on `LionField`, whereas viewValue is shared
 * across `LionField` and `._inputNode`.
 *
 * For restoring serialized values fetched from a server, we could consider one extra flow:
 * [3] Application Developer sets `.serializedValue`:
 *     Flow: serializedValue (deserializer) -> `.modelValue` (formatter) -> `.formattedValue` -> `._inputNode.value`
 *
 * @type {FormatMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<import('@lion/core').LitElement>} superclass
 */
const FormatMixinImplementation = superclass =>
  class FormatMixin extends ValidateMixin(FormControlMixin(superclass)) {
    /** @type {any} */
    static get properties() {
      return {
        /**
         * The view value is the result of the formatter function (when available).
         * The result will be stored in the native _inputNode (usually an input[type=text]).
         *
         * Examples:
         * - For a date input, this would be '20/01/1999' (dependent on locale).
         * - For a number input, this could be '1,234.56' (a String representation of modelValue
         * 1234.56)
         *
         * @private
         */
        formattedValue: { attribute: false },

        /**
         * The serialized version of the model value.
         * This value exists for maximal compatibility with the platform API.
         * The serialized value can be an interface in context where data binding is not
         * supported and a serialized string needs to be set.
         *
         * Examples:
         * - For a date input, this would be the iso format of a date, e.g. '1999-01-20'.
         * - For a number input this would be the String representation of a float ('1234.56'
         *   instead of 1234.56)
         *
         * When no parser is available, the value is usually the same as the formattedValue
         * (being _inputNode.value)
         *
         */
        serializedValue: { attribute: false },

        /**
         * Event that will trigger formatting (more precise, visual update of the view, so the
         * user sees the formatted value)
         * Default: 'change'
         */
        formatOn: { attribute: false },

        /**
         * Configuration object that will be available inside the formatter function
         */
        formatOptions: { attribute: false },
      };
    }

    /**
     * @param {string} name
     * @param {any} oldVal
     */
    requestUpdateInternal(name, oldVal) {
      super.requestUpdateInternal(name, oldVal);

      if (name === 'modelValue' && this.modelValue !== oldVal) {
        this._onModelValueChanged({ modelValue: this.modelValue }, { modelValue: oldVal });
      }
      if (name === 'serializedValue' && this.serializedValue !== oldVal) {
        this._calculateValues({ source: 'serialized' });
      }
      if (name === 'formattedValue' && this.formattedValue !== oldVal) {
        this._calculateValues({ source: 'formatted' });
      }
    }

    get value() {
      return (this._inputNode && this._inputNode.value) || this.__value || '';
    }

    // We don't delegate, because we want to preserve caret position via _setValueAndPreserveCaret
    /** @type {string} */
    set value(value) {
      // if not yet connected to dom can't change the value
      if (this._inputNode) {
        this._inputNode.value = value;
        /** @type {string | undefined} */
        this.__value = undefined;
      } else {
        this.__value = value;
      }
    }

    /**
     * Converts formattedValue to modelValue
     * For instance, a localized date to a Date Object
     * @param {string} v - formattedValue: the formatted value inside <input>
     * @param {FormatOptions} opts
     * @returns {*} modelValue
     */
    // eslint-disable-next-line no-unused-vars
    parser(v, opts) {
      return v;
    }

    /**
     * Converts modelValue to formattedValue (formattedValue will be synced with
     * `._inputNode.value`)
     * For instance, a Date object to a localized date.
     * @param {*} v - modelValue: can be an Object, Number, String depending on the
     * input type(date, number, email etc)
     * @param {FormatOptions} opts
     * @returns {string} formattedValue
     */
    // eslint-disable-next-line no-unused-vars
    formatter(v, opts) {
      return v;
    }

    /**
     * Converts `.modelValue` to `.serializedValue`
     * For instance, a Date object to an iso formatted date string
     * @param {?} v - modelValue: can be an Object, Number, String depending on the
     * input type(date, number, email etc)
     * @returns {string} serializedValue
     */
    serializer(v) {
      return v !== undefined ? v : '';
    }

    /**
     * Converts `LionField.value` to `.modelValue`
     * For instance, an iso formatted date string to a Date object
     * @param {?} v - modelValue: can be an Object, Number, String depending on the
     * input type(date, number, email etc)
     * @returns {?} modelValue
     */
    deserializer(v) {
      return v === undefined ? '' : v;
    }

    /**
     * Responsible for storing all representations(modelValue, serializedValue, formattedValue
     * and value) of the input value. Prevents infinite loops, so all value observers can be
     * treated like they will only be called once, without indirectly calling other observers.
     * (in fact, some are called twice, but the __preventRecursiveTrigger lock prevents the
     * second call from having effect).
     *
     * @param {{source:'model'|'serialized'|'formatted'|null}} config - the type of value that triggered this method. It should not be
     * set again, so that its observer won't be triggered. Can be:
     * 'model'|'formatted'|'serialized'.
     */
    _calculateValues({ source } = { source: null }) {
      if (this.__preventRecursiveTrigger) return; // prevent infinite loops

      /** @type {boolean} */
      this.__preventRecursiveTrigger = true;
      if (source !== 'model') {
        if (source === 'serialized') {
          /** @type {?} */
          this.modelValue = this.deserializer(this.serializedValue);
        } else if (source === 'formatted') {
          this.modelValue = this.__callParser();
        }
      }
      if (source !== 'formatted') {
        /** @type {string} */
        this.formattedValue = this.__callFormatter();
      }
      if (source !== 'serialized') {
        /** @type {string} */
        this.serializedValue = this.serializer(this.modelValue);
      }
      this._reflectBackFormattedValueToUser();
      this.__preventRecursiveTrigger = false;
    }

    /**
     * @param {string|undefined} value
     * @return {?}
     */
    __callParser(value = this.formattedValue) {
      // A) check if we need to parse at all

      // A.1) The end user had no intention to parse
      if (value === '') {
        // Ideally, modelValue should be undefined for empty strings.
        // For backwards compatibility we return an empty string:
        // - it triggers validation for required validators (see ValidateMixin.validate())
        // - it can be expected by 3rd parties (for instance unit tests)
        // TODO(@tlouisse): In a breaking refactor of the Validation System, this behavior can be corrected.
        return '';
      }

      // A.2) Handle edge cases We might have no view value yet, for instance because
      // _inputNode.value was not available yet
      if (typeof value !== 'string') {
        // This means there is nothing to find inside the view that can be of
        // interest to the Application Developer or needed to store for future
        // form state retrieval.
        return undefined;
      }

      // B) parse the view value

      // - if result:
      // return the successfully parsed viewValue
      // - if no result:
      // Apparently, the parser was not able to produce a satisfactory output for the desired
      // modelValue type, based on the current viewValue. Unparseable allows to restore all
      // states (for instance from a lost user session), since it saves the current viewValue.
      const result = this.parser(value, this.formatOptions);
      return result !== undefined ? result : new Unparseable(value);
    }

    /**
     * @returns {string|undefined}
     */
    __callFormatter() {
      // - Why check for this.hasError?
      // We only want to format values that are considered valid. For best UX,
      // we only 'reward' valid inputs.
      // - Why check for __isHandlingUserInput?
      // Downwards sync is prevented whenever we are in an `@user-input-changed` flow, [2].
      // If we are in a 'imperatively set `.modelValue`' flow, [1], we want to reflect back
      // the value, no matter what.
      // This means, whenever we are in hasError and modelValue is set
      // imperatively, we DO want to format a value (it is the only way to get meaningful
      // input into `._inputNode` with modelValue as input)

      if (
        this.__isHandlingUserInput &&
        this.hasFeedbackFor &&
        this.hasFeedbackFor.length &&
        this.hasFeedbackFor.includes('error') &&
        this._inputNode
      ) {
        return this._inputNode ? this.value : undefined;
      }

      if (this.modelValue instanceof Unparseable) {
        // When the modelValue currently is unparseable, we need to sync back the supplied
        // viewValue. In flow [2], this should not be needed.
        // In flow [1] (we restore a previously stored modelValue) we should sync down, however.
        return this.modelValue.viewValue;
      }

      return this.formatter(this.modelValue, this.formatOptions);
    }

    /**
     * Observer Handlers
     * @param {{ modelValue: unknown; }[]} args
     */
    _onModelValueChanged(...args) {
      this._calculateValues({ source: 'model' });
      this._dispatchModelValueChangedEvent(...args);
    }

    /**
     * @param {{ modelValue: unknown; }[]} args
     * This is wrapped in a distinct method, so that parents can control when the changed event
     * is fired. For objects, a deep comparison might be needed.
     */
    // eslint-disable-next-line no-unused-vars
    _dispatchModelValueChangedEvent(...args) {
      /** @event model-value-changed */
      this.dispatchEvent(
        new CustomEvent('model-value-changed', {
          bubbles: true,
          detail: /** @type { ModelValueEventDetails } */ ({
            formPath: [this],
            isTriggeredByUser: Boolean(this.__isHandlingUserInput),
          }),
        }),
      );
    }

    /**
     * Synchronization from `._inputNode.value` to `LionField` (flow [2])
     */
    _syncValueUpwards() {
      // Downwards syncing should only happen for `LionField`.value changes from 'above'
      // This triggers _onModelValueChanged and connects user input to the
      // parsing/formatting/serializing loop
      this.modelValue = this.__callParser(this.value);
    }

    /**
     * Synchronization from `LionField.value` to `._inputNode.value`
     * - flow [1] will always be reflected back
     * - flow [2] will not be reflected back when this flow was triggered via
     *   `@user-input-changed` (this will happen later, when `formatOn` condition is met)
     */
    _reflectBackFormattedValueToUser() {
      if (this._reflectBackOn()) {
        // Text 'undefined' should not end up in <input>
        this.value = typeof this.formattedValue !== 'undefined' ? this.formattedValue : '';
      }
    }

    /**
     * @return {boolean}
     */
    _reflectBackOn() {
      return !this.__isHandlingUserInput;
    }

    // This can be called whenever the view value should be updated. Dependent on component type
    // ("input" for <input> or "change" for <select>(mainly for IE)) a different event should be
    // used  as source for the "user-input-changed" event (which can be seen as an abstraction
    // layer on top of other events (input, change, whatever))
    _proxyInputEvent() {
      this.dispatchEvent(
        new CustomEvent('user-input-changed', {
          bubbles: true,
          composed: true,
        }),
      );
    }

    _onUserInputChanged() {
      // Upwards syncing. Most properties are delegated right away, value is synced to
      // `LionField`, to be able to act on (imperatively set) value changes
      this.__isHandlingUserInput = true;
      this._syncValueUpwards();
      this.__isHandlingUserInput = false;
    }

    constructor() {
      super();
      this.formatOn = 'change';
      this.formatOptions = /** @type {FormatOptions} */ ({});
    }

    connectedCallback() {
      super.connectedCallback();
      this._reflectBackFormattedValueToUser = this._reflectBackFormattedValueToUser.bind(this);

      this._reflectBackFormattedValueDebounced = () => {
        // Make sure this is fired after the change event of _inputNode, so that formattedValue
        // is guaranteed to be calculated
        setTimeout(this._reflectBackFormattedValueToUser);
      };
      this.addEventListener('user-input-changed', this._onUserInputChanged);
      // Connect the value found in <input> to the formatting/parsing/serializing loop as a
      // fallback mechanism. Assume the user uses the value property of the
      // `LionField`(recommended api) as the api (this is a downwards sync).
      // However, when no value is specified on `LionField`, have support for sync of the real
      // input to the `LionField` (upwards sync).
      if (typeof this.modelValue === 'undefined') {
        this._syncValueUpwards();
      }
      this._reflectBackFormattedValueToUser();

      if (this._inputNode) {
        this._inputNode.addEventListener(this.formatOn, this._reflectBackFormattedValueDebounced);
        this._inputNode.addEventListener('input', this._proxyInputEvent);
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this.removeEventListener('user-input-changed', this._onUserInputChanged);
      if (this._inputNode) {
        this._inputNode.removeEventListener('input', this._proxyInputEvent);
        this._inputNode.removeEventListener(
          this.formatOn,
          /** @type {EventListenerOrEventListenerObject} */ (this
            ._reflectBackFormattedValueDebounced),
        );
      }
    }
  };

const FormatMixin = dedupeMixin(FormatMixinImplementation);

/**
 * @typedef {import('../types/InteractionStateMixinTypes').InteractionStateMixin} InteractionStateMixin
 */

/**
 * @desc `InteractionStateMixin` adds meta information about touched and dirty states, that can
 * be read by other form components (ing-uic-input-error for instance, uses the touched state
 * to determine whether an error message needs to be shown).
 * Interaction states will be set when a user:
 * - leaves a form field(blur) -> 'touched' will be set to true. 'prefilled' when a
 *   field is left non-empty
 * - on keyup (actually, on the model-value-changed event) -> 'dirty' will be set to true
 *
 * @type {InteractionStateMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<import('@lion/core').LitElement>} superclass
 */
const InteractionStateMixinImplementation = superclass =>
  class InteractionStateMixin extends FormControlMixin(superclass) {
    /** @type {any} */
    static get properties() {
      return {
        /**
         * True when user has focused and left(blurred) the field.
         */
        touched: {
          type: Boolean,
          reflect: true,
        },
        /**
         * True when user has changed the value of the field.
         */
        dirty: {
          type: Boolean,
          reflect: true,
        },
        /**
         * True when the modelValue is non-empty (see _isEmpty in FormControlMixin)
         */
        filled: {
          type: Boolean,
          reflect: true,
        },
        /**
         * True when user has left non-empty field or input is prefilled.
         * The name must be seen from the point of view of the input field:
         * once the user enters the input field, the value is non-empty.
         */
        prefilled: {
          attribute: false,
        },
        /**
         * True when user has attempted to submit the form, e.g. through a button
         * of type="submit"
         */
        submitted: {
          attribute: false,
        },
      };
    }

    /**
     *
     * @param {PropertyKey} name
     * @param {*} oldVal
     */
    requestUpdateInternal(name, oldVal) {
      super.requestUpdateInternal(name, oldVal);
      if (name === 'touched' && this.touched !== oldVal) {
        this._onTouchedChanged();
      }

      if (name === 'modelValue') {
        // We do this in requestUpdateInternal because we don't want to fire another re-render (e.g. when doing this in updated)
        // Furthermore, we cannot do it on model-value-changed event because it isn't fired initially.
        this.filled = !this._isEmpty();
      }

      if (name === 'dirty' && this.dirty !== oldVal) {
        this._onDirtyChanged();
      }
    }

    constructor() {
      super();
      this.touched = false;
      this.dirty = false;
      this.prefilled = false;
      this.filled = false;

      /** @type {string} */
      this._leaveEvent = 'blur';
      /** @type {string} */
      this._valueChangedEvent = 'model-value-changed';
      /** @type {EventHandlerNonNull} */
      this._iStateOnLeave = this._iStateOnLeave.bind(this);
      /** @type {EventHandlerNonNull} */
      this._iStateOnValueChange = this._iStateOnValueChange.bind(this);
    }

    /**
     * Register event handlers and validate prefilled inputs
     */
    connectedCallback() {
      super.connectedCallback();
      this.addEventListener(this._leaveEvent, this._iStateOnLeave);
      this.addEventListener(this._valueChangedEvent, this._iStateOnValueChange);
      this.initInteractionState();
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this.removeEventListener(this._leaveEvent, this._iStateOnLeave);
      this.removeEventListener(this._valueChangedEvent, this._iStateOnValueChange);
    }

    /**
     * Evaluations performed on connectedCallback. Since some components can be out of sync
     * (due to interdependence on light children that can only be processed
     * after connectedCallback and affect the initial value).
     * This method is exposed, so it can be called after they are initialized themselves.
     * Since this method will be called twice in last mentioned scenario, it must stay idempotent.
     */
    initInteractionState() {
      this.dirty = false;
      this.prefilled = !this._isEmpty();
    }

    /**
     * Sets touched value to true
     * Reevaluates prefilled state.
     * When false, on next interaction, user will start with a clean state.
     * @protected
     */
    _iStateOnLeave() {
      this.touched = true;
      this.prefilled = !this._isEmpty();
    }

    /**
     * Sets dirty value and validates when already touched or invalid
     * @protected
     */
    _iStateOnValueChange() {
      this.dirty = true;
    }

    /**
     * Resets touched and dirty, and recomputes prefilled
     */
    resetInteractionState() {
      this.touched = false;
      this.submitted = false;
      this.dirty = false;
      this.prefilled = !this._isEmpty();
    }

    _onTouchedChanged() {
      this.dispatchEvent(new CustomEvent('touched-changed', { bubbles: true, composed: true }));
    }

    _onDirtyChanged() {
      this.dispatchEvent(new CustomEvent('dirty-changed', { bubbles: true, composed: true }));
    }

    /**
     * Show the validity feedback when one of the following conditions is met:
     *
     * - submitted
     *   If the form is submitted, always show the error message.
     *
     * - prefilled
     *   the user already filled in something, or the value is prefilled
     *   when the form is initially rendered.
     *
     * - touched && dirty
     *   When a user starts typing for the first time in a field with for instance `required`
     *   validation, error message should not be shown until a field becomes `touched`
     *   (a user leaves(blurs) a field).
     *   When a user enters a field without altering the value(making it `dirty`),
     *   an error message shouldn't be shown either.
     */
    _showFeedbackConditionFor() {
      return (this.touched && this.dirty) || this.prefilled || this.submitted;
    }
  };

const InteractionStateMixin = dedupeMixin(InteractionStateMixinImplementation);

/**
 * `LionField`: wraps <input>, <textarea>, <select> and other interactable elements.
 * Also it would follow a nice hierarchy: lion-form -> lion-fieldset -> lion-field
 *
 * Note: We don't support placeholders, because we have a helper text and
 * placeholders confuse the user with accessibility needs.
 *
 * Please see the docs for in depth information.
 *
 * @example
 * <lion-field name="myName">
 *   <label slot="label">My Input</label>
 *   <input type="text" slot="input">
 * </lion-field>
 *
 * @customElement lion-field
 */
class LionField extends FormControlMixin(
  InteractionStateMixin(FocusMixin(FormatMixin(ValidateMixin(SlotMixin(LitElement))))),
) {
  /** @type {any} */
  static get properties() {
    return {
      autocomplete: {
        type: String,
        reflect: true,
      },
      value: {
        type: String,
      },
    };
  }

  constructor() {
    super();
    this.name = '';
    /** @type {string | undefined} */
    this.autocomplete = undefined;
  }

  /**
   * @param {import('@lion/core').PropertyValues } changedProperties
   */
  firstUpdated(changedProperties) {
    super.firstUpdated(changedProperties);
    /** @type {any} */
    this._initialModelValue = this.modelValue;
  }

  connectedCallback() {
    super.connectedCallback();
    this._onChange = this._onChange.bind(this);
    this._inputNode.addEventListener('change', this._onChange);
    this.classList.add('form-field'); // eslint-disable-line
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._inputNode.removeEventListener('change', this._onChange);
  }

  resetInteractionState() {
    super.resetInteractionState();
    this.submitted = false;
  }

  reset() {
    this.modelValue = this._initialModelValue;
    this.resetInteractionState();
  }

  /**
   * Clears modelValue.
   * Interaction states are not cleared (use resetInteractionState for this)
   */
  clear() {
    this.modelValue = ''; // can't set null here, because IE11 treats it as a string
  }

  _onChange() {
    this.dispatchEvent(
      new CustomEvent('user-input-changed', {
        bubbles: true,
      }),
    );
  }
}

/* eslint-disable */

/**
 * @desc This class closely mimics the natively
 * supported HTMLFormControlsCollection. It can be accessed
 * both like an array and an object (based on control/element names).
 * @example
 * // This is how a native form works:
 * <form>
 *   <input id="a" name="a">
 *   <fieldset>
 *      <input id="b1" name="b[]">
 *      <input id="b2" name="b[]">
 *      <input id="c" name="c">
 *   </fieldset>
 *   <select id="d" name="d">
 *     <option></option>
 *   </select>
 *   <fieldset>
 *     <input type="radio" id="e1" name="e">
 *     <input type="radio" id="e2" name="e">
 *   </fieldset>
 *   <select id="f" name="f" multiple>
 *     <option></option>
 *   </select>
 *   <fieldset>
 *     <input type="checkbox" id="g1" name="g">
 *     <input type="checkbox" id="g2" name="g">
 *   </fieldset>
 * </form>
 *
 * form.elements[0]; // Element input#a
 * form.elements[1]; // Element input#b1
 * form.elements[2]; // Element input#b2
 * form.elements[3]; // Element input#c
 * form.elements.a;  // Element input#a
 * form.elements.b;  // RadioNodeList<Element> [input#b1, input#b2]
 * form.elements.c;  // input#c
 *
 * // This is how a Lion form works (for simplicity Lion components have the 'l'-prefix):
 * <l-form>
 *  <form>
 *
 *    <!-- fields -->
 *
 *    <l-input id="a" name="a"></l-input>
 *
 *
 *    <!-- field sets ('sub forms') -->
 *
 *    <l-fieldset>
 *      <l-input id="b1" name="b"</l-input>
 *      <l-input id="b2" name="b"></l-input>
 *      <l-input id="c" name="c"></l-input>
 *    </l-fieldset>
 *
 *
 *    <!-- choice groups (children are 'end points') -->
 *
 *    <!-- single selection choice groups -->
 *    <l-select id="d" name="d">
 *      <l-option></l-option>
 *    </l-select>
 *    <l-radio-group id="e" name="e">
 *      <l-radio></l-radio>
 *      <l-radio></l-radio>
 *    </l-radio-group>
 *
 *    <!-- multi selection choice groups -->
 *    <l-select id="f" name="f" multiple>
 *      <l-option></l-option>
 *    </l-select>
 *    <l-checkbox-group id="g" name="g">
 *      <l-checkbox></l-checkbox>
 *      <l-checkbox></l-checkbox>
 *    </l-checkbox-group>
 *
 *  </form>
 * </l-form>
 *
 * lionForm.formElements[0];                  // Element l-input#a
 * lionForm.formElements[1];                  // Element l-input#b1
 * lionForm.formElements[2];                  // Element l-input#b2
 * lionForm.formElements.a;                   // Element l-input#a
 * lionForm.formElements['b[]'];              // Array<Element> [l-input#b1, l-input#b2]
 * lionForm.formElements.c;                   // Element l-input#c
 *
 * lionForm.formElements[d-g].formElements; // Array<Element>
 *
 * lionForm.formElements[d-e].value;          // String
 * lionForm.formElements[f-g].value;          // Array<String>
 */
class FormControlsCollection extends Array {
  /**
   * @desc Gives back the named keys and filters out array indexes
   * @return {string[]}
   */
  _keys() {
    return Object.keys(this).filter(k => Number.isNaN(Number(k)));
  }
}

// eslint-disable-next-line max-classes-per-file

/**
 * @typedef {import('../../types/registration/FormRegistrarMixinTypes').FormRegistrarMixin} FormRegistrarMixin
 * @typedef {import('../../types/registration/FormRegistrarMixinTypes').ElementWithParentFormGroup} ElementWithParentFormGroup
 * @typedef {import('../../types/registration/FormRegisteringMixinTypes').FormRegisteringHost} FormRegisteringHost
 */

/**
 * @typedef {import('../../types/FormControlMixinTypes').FormControlHost} FormControlHost
 * @typedef {FormControlHost & HTMLElement & {_parentFormGroup?:HTMLElement, checked?:boolean}} FormControl
 */

/**
 * @desc This allows an element to become the manager of a register.
 * It basically keeps track of a FormControlsCollection that it stores in .formElements
 * This will always be an array of all elements.
 * In case of a form or fieldset(sub form), it will also act as a key based object with FormControl
 * (fields, choice groups or fieldsets)as keys.
 * For choice groups, the value will only stay an array.
 * See FormControlsCollection for more information
 * @type {FormRegistrarMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<import('@lion/core').LitElement>} superclass
 */
const FormRegistrarMixinImplementation = superclass =>
  // eslint-disable-next-line no-shadow, no-unused-vars
  class extends FormRegisteringMixin(superclass) {
    static get properties() {
      return {
        /**
         * @desc Flag that determines how ".formElements" should behave.
         * For a regular fieldset (see LionFieldset) we expect ".formElements"
         * to be accessible as an object.
         * In case of a radio-group, a checkbox-group or a select/listbox,
         * it should act like an array (see ChoiceGroupMixin).
         * Usually, when false, we deal with a choice-group (radio-group, checkbox-group,
         * (multi)select)
         */
        _isFormOrFieldset: { type: Boolean },
      };
    }

    constructor() {
      super();
      this.formElements = new FormControlsCollection();

      this._isFormOrFieldset = false;

      this._onRequestToAddFormElement = this._onRequestToAddFormElement.bind(this);
      this._onRequestToChangeFormElementName = this._onRequestToChangeFormElementName.bind(this);

      this.addEventListener(
        'form-element-register',
        /** @type {EventListenerOrEventListenerObject} */ (this._onRequestToAddFormElement),
      );
      this.addEventListener(
        'form-element-name-changed',
        /** @type {EventListenerOrEventListenerObject} */ (this._onRequestToChangeFormElementName),
      );
    }

    /**
     *
     * @param {ElementWithParentFormGroup} el
     */
    isRegisteredFormElement(el) {
      return this.formElements.some(exitingEl => exitingEl === el);
    }

    /**
     * @param {FormControl} child the child element (field)
     * @param {number} indexToInsertAt index to insert the form element at
     */
    addFormElement(child, indexToInsertAt) {
      // This is a way to let the child element (a lion-fieldset or lion-field) know, about its parent
      // eslint-disable-next-line no-param-reassign
      child._parentFormGroup = this;

      // 1. Add children as array element
      if (indexToInsertAt >= 0) {
        this.formElements.splice(indexToInsertAt, 0, child);
      } else {
        this.formElements.push(child);
      }

      // 2. Add children as object key
      if (this._isFormOrFieldset) {
        const { name } = child;
        if (!name) {
          console.info('Error Node:', child); // eslint-disable-line no-console
          throw new TypeError('You need to define a name');
        }
        // @ts-expect-error this._isFormOrFieldset true means we can assume `this.name` exists
        if (name === this.name) {
          console.info('Error Node:', child); // eslint-disable-line no-console
          throw new TypeError(`You can not have the same name "${name}" as your parent`);
        }

        if (name.substr(-2) === '[]') {
          if (!Array.isArray(this.formElements[name])) {
            this.formElements[name] = new FormControlsCollection();
          }
          if (indexToInsertAt > 0) {
            this.formElements[name].splice(indexToInsertAt, 0, child);
          } else {
            this.formElements[name].push(child);
          }
        } else if (!this.formElements[name]) {
          this.formElements[name] = child;
        } else {
          console.info('Error Node:', child); // eslint-disable-line no-console
          throw new TypeError(
            `Name "${name}" is already registered - if you want an array add [] to the end`,
          );
        }
      }
    }

    /**
     * @param {FormRegisteringHost} child the child element (field)
     */
    removeFormElement(child) {
      // 1. Handle array based children
      const index = this.formElements.indexOf(child);
      if (index > -1) {
        this.formElements.splice(index, 1);
      }

      // 2. Handle name based object keys
      if (this._isFormOrFieldset) {
        // @ts-expect-error
        const { name } = child; // FIXME: <-- ElementWithParentFormGroup should become LionFieldWithParentFormGroup so that "name" exists
        if (name.substr(-2) === '[]' && this.formElements[name]) {
          const idx = this.formElements[name].indexOf(child);
          if (idx > -1) {
            this.formElements[name].splice(idx, 1);
          }
        } else if (this.formElements[name]) {
          delete this.formElements[name];
        }
      }
    }

    /**
     * @param {CustomEvent} ev
     */
    _onRequestToAddFormElement(ev) {
      const child = ev.detail.element;
      if (child === this) {
        // as we fire and listen - don't add ourselves
        return;
      }
      if (this.isRegisteredFormElement(child)) {
        // do not readd already existing elements
        return;
      }
      ev.stopPropagation();

      // Check for siblings to determine the right order to insert into formElements
      // If there is no next sibling, index is -1
      let indexToInsertAt = -1;
      if (this.formElements && Array.isArray(this.formElements)) {
        indexToInsertAt = this.formElements.indexOf(child.nextElementSibling);
      }
      this.addFormElement(child, indexToInsertAt);
    }

    /**
     * @param {CustomEvent} ev
     */
    _onRequestToChangeFormElementName(ev) {
      const element = this.formElements[ev.detail.oldName];
      if (element) {
        this.formElements[ev.detail.newName] = element;
        delete this.formElements[ev.detail.oldName];
      }
    }

    /**
     * @param {CustomEvent} ev
     */
    _onRequestToRemoveFormElement(ev) {
      const child = ev.detail.element;
      if (child === this) {
        // as we fire and listen - don't remove ourselves
        return;
      }
      if (!this.isRegisteredFormElement(child)) {
        // do not remove non existing elements
        return;
      }
      ev.stopPropagation();

      this.removeFormElement(child);
    }
  };

const FormRegistrarMixin = dedupeMixin(FormRegistrarMixinImplementation);

/**
 * @typedef {import('../types/NativeTextFieldMixinTypes').NativeTextFieldMixin} NativeTextFieldMixin
 * @type {NativeTextFieldMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<import('../types/NativeTextFieldMixinTypes').NativeTextField>} superclass} superclass
 */
const NativeTextFieldMixinImplementation = superclass =>
  class NativeTextFieldMixin extends superclass {
    /** @type {number} */
    get selectionStart() {
      const native = this._inputNode;
      if (native && native.selectionStart) {
        return native.selectionStart;
      }
      return 0;
    }

    set selectionStart(value) {
      const native = this._inputNode;
      if (native && native.selectionStart) {
        native.selectionStart = value;
      }
    }

    /** @type {number} */
    get selectionEnd() {
      const native = this._inputNode;
      if (native && native.selectionEnd) {
        return native.selectionEnd;
      }
      return 0;
    }

    set selectionEnd(value) {
      const native = this._inputNode;
      if (native && native.selectionEnd) {
        native.selectionEnd = value;
      }
    }

    get value() {
      return (this._inputNode && this._inputNode.value) || this.__value || '';
    }

    // We don't delegate, because we want to preserve caret position via _setValueAndPreserveCaret
    /** @param {string} value */
    set value(value) {
      // if not yet connected to dom can't change the value
      if (this._inputNode) {
        this._setValueAndPreserveCaret(value);
        /** @type {string | undefined} */
        this.__value = undefined;
      } else {
        this.__value = value;
      }
    }

    /**
     * Restores the cursor to its original position after updating the value.
     * @param {string} newValue The value that should be saved.
     */
    _setValueAndPreserveCaret(newValue) {
      // Only preserve caret if focused (changing selectionStart will move focus in Safari)
      if (this.focused) {
        // Not all elements might have selection, and even if they have the
        // right properties, accessing them might throw an exception (like for
        // <input type=number>)
        try {
          // SelectElement doesn't have selectionStart/selectionEnd
          if (!(this._inputNode instanceof HTMLSelectElement)) {
            const start = this._inputNode.selectionStart;
            this._inputNode.value = newValue;
            // The cursor automatically jumps to the end after re-setting the value,
            // so restore it to its original position.
            this._inputNode.selectionStart = start;
            this._inputNode.selectionEnd = start;
          }
        } catch (error) {
          // Just set the value and give up on the caret.
          this._inputNode.value = newValue;
        }
      } else {
        this._inputNode.value = newValue;
      }
    }
  };

const NativeTextFieldMixin = dedupeMixin(NativeTextFieldMixinImplementation);

/* eslint-disable max-classes-per-file */

/**
 * @param {?} value
 */
function isDate(value) {
  return (
    Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())
  );
}

class IsDate extends Validator {
  static get validatorName() {
    return 'IsDate';
  }

  /**
   * @param {?} value
   */
  // eslint-disable-next-line class-methods-use-this
  execute(value) {
    let hasError = false;
    if (!isDate(value)) {
      hasError = true;
    }
    return hasError;
  }
}

class FormElementsHaveNoError extends Validator {
  static get validatorName() {
    return 'FormElementsHaveNoError';
  }

  /**
   * @param {unknown} [value]
   * @param {string | undefined} [options]
   * @param {{ node: any }} config
   */
  // eslint-disable-next-line class-methods-use-this
  execute(value, options, config) {
    const hasError = config.node._anyFormElementHasFeedbackFor('error');
    return hasError;
  }

  static async getMessage() {
    return '';
  }
}

/**
 * @typedef {import('../../types/form-group/FormGroupMixinTypes').FormGroupMixin} FormGroupMixin
 * @typedef {import('../../types/form-group/FormGroupMixinTypes').FormGroupHost} FormGroupHost
 * @typedef {import('../../types/FormControlMixinTypes').FormControlHost} FormControlHost
 * @typedef {import('../../types/registration/FormRegisteringMixinTypes').FormRegisteringHost} FormRegisteringHost
 * @typedef {import('../../types/registration/FormRegistrarMixinTypes').ElementWithParentFormGroup} ElementWithParentFormGroup
 * @typedef {FormControlHost & HTMLElement & {_parentFormGroup?: HTMLElement, checked?: boolean, disabled: boolean, hasFeedbackFor: string[], makeRequestToBeDisabled: Function }} FormControl
 */

/**
 * @desc Form group mixin serves as the basis for (sub) forms. Designed to be put on
 * elements with [role="group|radiogroup"] (think of checkbox-group, radio-group, fieldset).
 * It bridges all the functionality of the child form controls:
 * ValidateMixin, InteractionStateMixin, FormatMixin, FormControlMixin etc.
 * It is designed to be used on top of FormRegistrarMixin and ChoiceGroupMixin.
 * Also, it is th basis of the LionFieldset element (which supports name based retrieval of
 * children via formElements and the automatic grouping of formElements via '[]').
 *
 * @type {FormGroupMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<import('@lion/core').LitElement>} superclass
 */
const FormGroupMixinImplementation = superclass =>
  class FormGroupMixin extends FormRegistrarMixin(
    FormControlMixin(ValidateMixin(DisabledMixin(SlotMixin(superclass)))),
  ) {
    /** @type {any} */
    static get properties() {
      return {
        /**
         * Interaction state that can be used to compute the visibility of
         * feedback messages
         */
        submitted: {
          type: Boolean,
          reflect: true,
        },
        /**
         * Interaction state that will be active when any of the children
         * is focused.
         */
        focused: {
          type: Boolean,
          reflect: true,
        },
        /**
         * Interaction state that will be active when any of the children
         * is dirty (see InteractionStateMixin for more details.)
         */
        dirty: {
          type: Boolean,
          reflect: true,
        },
        /**
         * Interaction state that will be active when the group as a whole is
         * blurred
         */
        touched: {
          type: Boolean,
          reflect: true,
        },
        /**
         * Interaction state that will be active when all of the children
         * are prefilled (see InteractionStateMixin for more details.)
         */
        prefilled: {
          type: Boolean,
          reflect: true,
        },
      };
    }

    get _inputNode() {
      return this;
    }

    get modelValue() {
      return this._getFromAllFormElements('modelValue');
    }

    set modelValue(values) {
      if (this.__isInitialModelValue) {
        this.__isInitialModelValue = false;
        this.registrationComplete.then(() => {
          this._setValueMapForAllFormElements('modelValue', values);
        });
      } else {
        this._setValueMapForAllFormElements('modelValue', values);
      }
    }

    get serializedValue() {
      return this._getFromAllFormElements('serializedValue');
    }

    set serializedValue(values) {
      if (this.__isInitialSerializedValue) {
        this.__isInitialSerializedValue = false;
        this.registrationComplete.then(() => {
          this._setValueMapForAllFormElements('serializedValue', values);
        });
      } else {
        this._setValueMapForAllFormElements('serializedValue', values);
      }
    }

    get formattedValue() {
      return this._getFromAllFormElements('formattedValue');
    }

    set formattedValue(values) {
      this._setValueMapForAllFormElements('formattedValue', values);
    }

    get prefilled() {
      return this._everyFormElementHas('prefilled');
    }

    constructor() {
      super();
      // inputNode = this, which always requires a value prop
      this.value = '';

      this.disabled = false;
      this.submitted = false;
      this.dirty = false;
      this.touched = false;
      this.focused = false;
      this.__addedSubValidators = false;
      this.__isInitialModelValue = true;
      this.__isInitialSerializedValue = true;

      this._checkForOutsideClick = this._checkForOutsideClick.bind(this);

      this.addEventListener('focusin', this._syncFocused);
      this.addEventListener('focusout', this._onFocusOut);
      this.addEventListener('dirty-changed', this._syncDirty);
      this.addEventListener('validate-performed', this.__onChildValidatePerformed);

      this.defaultValidators = [new FormElementsHaveNoError()];
      /** @type {Promise<any> & {done?:boolean}} */
      this.registrationComplete = new Promise((resolve, reject) => {
        this.__resolveRegistrationComplete = resolve;
        this.__rejectRegistrationComplete = reject;
      });
      this.registrationComplete.done = false;
      this.registrationComplete.then(
        () => {
          this.registrationComplete.done = true;
        },
        () => {
          this.registrationComplete.done = true;
          throw new Error(
            'Registration could not finish. Please use await el.registrationComplete;',
          );
        },
      );
    }

    connectedCallback() {
      super.connectedCallback();
      this.setAttribute('role', 'group');
      Promise.resolve().then(() => this.__resolveRegistrationComplete());

      this.registrationComplete.then(() => {
        this.__isInitialModelValue = false;
        this.__isInitialSerializedValue = false;
        this.__initInteractionStates();
      });
    }

    disconnectedCallback() {
      super.disconnectedCallback();

      if (this.__hasActiveOutsideClickHandling) {
        document.removeEventListener('click', this._checkForOutsideClick);
        this.__hasActiveOutsideClickHandling = false;
      }
      if (this.registrationComplete.done === false) {
        this.__rejectRegistrationComplete();
      }
    }

    __initInteractionStates() {
      this.formElements.forEach(el => {
        if (typeof el.initInteractionState === 'function') {
          el.initInteractionState();
        }
      });
    }

    /**
     * @override from FormControlMixin
     */
    _triggerInitialModelValueChangedEvent() {
      this.registrationComplete.then(() => {
        this.__dispatchInitialModelValueChangedEvent();
      });
    }

    /**
     * @param {import('@lion/core').PropertyValues } changedProperties
     */
    updated(changedProperties) {
      super.updated(changedProperties);

      if (changedProperties.has('disabled')) {
        if (this.disabled) {
          this.__requestChildrenToBeDisabled();
        } else {
          this.__retractRequestChildrenToBeDisabled();
        }
      }

      if (changedProperties.has('focused')) {
        if (this.focused === true) {
          this.__setupOutsideClickHandling();
        }
      }
    }

    __setupOutsideClickHandling() {
      if (!this.__hasActiveOutsideClickHandling) {
        document.addEventListener('click', this._checkForOutsideClick);
        this.__hasActiveOutsideClickHandling = true;
      }
    }

    /**
     * @param {Event} event
     */
    _checkForOutsideClick(event) {
      const outsideGroupClicked = !this.contains(/** @type {Node} */ (event.target));
      if (outsideGroupClicked) {
        this.touched = true;
      }
    }

    __requestChildrenToBeDisabled() {
      this.formElements.forEach(child => {
        if (child.makeRequestToBeDisabled) {
          child.makeRequestToBeDisabled();
        }
      });
    }

    __retractRequestChildrenToBeDisabled() {
      this.formElements.forEach(child => {
        if (child.retractRequestToBeDisabled) {
          child.retractRequestToBeDisabled();
        }
      });
    }

    // eslint-disable-next-line class-methods-use-this
    _inputGroupTemplate() {
      return html`
        <div class="input-group">
          <slot></slot>
        </div>
      `;
    }

    /**
     * @desc Handles interaction state 'submitted'.
     * This allows children to enable visibility of validation feedback
     */
    submitGroup() {
      this.submitted = true;
      this.formElements.forEach(child => {
        if (typeof child.submitGroup === 'function') {
          child.submitGroup();
        } else {
          child.submitted = true; // eslint-disable-line no-param-reassign
        }
      });
    }

    resetGroup() {
      this.formElements.forEach(child => {
        if (typeof child.resetGroup === 'function') {
          child.resetGroup();
        } else if (typeof child.reset === 'function') {
          child.reset();
        }
      });

      this.resetInteractionState();
    }

    clearGroup() {
      this.formElements.forEach(child => {
        if (typeof child.clearGroup === 'function') {
          child.clearGroup();
        } else if (typeof child.clear === 'function') {
          child.clear();
        }
      });

      this.resetInteractionState();
    }

    resetInteractionState() {
      this.submitted = false;
      this.touched = false;
      this.dirty = false;
      this.formElements.forEach(formElement => {
        if (typeof formElement.resetInteractionState === 'function') {
          formElement.resetInteractionState();
        }
      });
    }

    /**
     * @param {string} property
     */
    _getFromAllFormElements(property, filterFn = (/** @type {FormControl} */ el) => !el.disabled) {
      const result = {};
      this.formElements._keys().forEach(name => {
        const elem = this.formElements[name];
        if (elem instanceof FormControlsCollection) {
          result[name] = elem.filter(el => filterFn(el)).map(el => el[property]);
        } else if (filterFn(elem)) {
          if (typeof elem._getFromAllFormElements === 'function') {
            result[name] = elem._getFromAllFormElements(property, filterFn);
          } else {
            result[name] = elem[property];
          }
        }
      });
      return result;
    }

    /**
     * @param {string | number} property
     * @param {any} value
     */
    _setValueForAllFormElements(property, value) {
      this.formElements.forEach(el => {
        el[property] = value; // eslint-disable-line no-param-reassign
      });
    }

    /**
     * @param {string} property
     * @param {{ [x: string]: any; }} values
     */
    _setValueMapForAllFormElements(property, values) {
      if (values && typeof values === 'object') {
        Object.keys(values).forEach(name => {
          if (Array.isArray(this.formElements[name])) {
            this.formElements[name].forEach((
              /** @type {FormControl} */ el,
              /** @type {number} */ index,
            ) => {
              el[property] = values[name][index]; // eslint-disable-line no-param-reassign
            });
          }
          if (this.formElements[name]) {
            this.formElements[name][property] = values[name];
          }
        });
      }
    }

    /**
     * @param {string} property
     */
    _anyFormElementHas(property) {
      return Object.keys(this.formElements).some(name => {
        if (Array.isArray(this.formElements[name])) {
          return this.formElements[name].some((/** @type {FormControl} */ el) => !!el[property]);
        }
        return !!this.formElements[name][property];
      });
    }

    /**
     * @param {string} state one of ValidateHost.validationTypes
     */
    _anyFormElementHasFeedbackFor(state) {
      return Object.keys(this.formElements).some(name => {
        if (Array.isArray(this.formElements[name])) {
          return this.formElements[name].some((/** @type {FormControl} */ el) =>
            Boolean(el.hasFeedbackFor && el.hasFeedbackFor.includes(state)),
          );
        }
        return Boolean(
          this.formElements[name].hasFeedbackFor &&
            this.formElements[name].hasFeedbackFor.includes(state),
        );
      });
    }

    /**
     * @param {string} property
     */
    _everyFormElementHas(property) {
      return Object.keys(this.formElements).every(name => {
        if (Array.isArray(this.formElements[name])) {
          return this.formElements[name].every((/** @type {FormControl} */ el) => !!el[property]);
        }
        return !!this.formElements[name][property];
      });
    }

    /**
     * Gets triggered by event 'validate-performed' which enabled us to handle 2 different situations
     *    - react on modelValue change, which says something about the validity as a whole
     *        (at least two checkboxes for instance) and nothing about the children's values
     *    - children validity states have changed, so fieldset needs to update itself based on that
     * @param {Event} ev
     */
    __onChildValidatePerformed(ev) {
      if (ev && this.isRegisteredFormElement(/** @type {FormControl} */ (ev.target))) {
        this.validate();
      }
    }

    _syncFocused() {
      this.focused = this._anyFormElementHas('focused');
    }

    /**
     * @param {Event} ev
     */
    _onFocusOut(ev) {
      const lastEl = this.formElements[this.formElements.length - 1];
      if (ev.target === lastEl) {
        this.touched = true;
      }
      this.focused = false;
    }

    _syncDirty() {
      this.dirty = this._anyFormElementHas('dirty');
    }

    /**
     * @param {FormControl} child
     */
    __linkChildrenMessagesToParent(child) {
      // aria-describedby of (nested) children
      const unTypedThis = /** @type {unknown} */ (this);
      let parent = /** @type {FormControlHost & { _parentFormGroup:any }} */ (unTypedThis);
      const ctor = /** @type {typeof FormGroupMixin} */ (this.constructor);
      while (parent) {
        ctor._addDescriptionElementIdsToField(child, parent._getAriaDescriptionElements());
        // Also check if the newly added child needs to refer grandparents
        parent = parent._parentFormGroup;
      }
    }

    /**
     * @override of FormRegistrarMixin.
     * @desc Connects ValidateMixin and DisabledMixin
     * On top of this, error messages of children are linked to their parents
     * @param {FormControl} child
     * @param {number} indexToInsertAt
     */
    addFormElement(child, indexToInsertAt) {
      super.addFormElement(child, indexToInsertAt);
      if (this.disabled) {
        child.makeRequestToBeDisabled();
      }
      // TODO: Unlink in removeFormElement
      this.__linkChildrenMessagesToParent(child);
      this.validate({ clearCurrentResult: true });
    }

    /**
     * Gathers initial model values of all children. Used
     * when resetGroup() is called.
     */
    get _initialModelValue() {
      return this._getFromAllFormElements('_initialModelValue');
    }

    /**
     * Add aria-describedby to child element(field), so that it points to feedback/help-text of
     * parent(fieldset)
     * @param {FormControl} field - the child: lion-field/lion-input/lion-textarea
     * @param {HTMLElement[]} descriptionElements  - description elements like feedback and help-text
     */
    static _addDescriptionElementIdsToField(field, descriptionElements) {
      const orderedEls = getAriaElementsInRightDomOrder(descriptionElements, { reverse: true });
      orderedEls.forEach(el => {
        if (field.addToAriaDescribedBy) {
          field.addToAriaDescribedBy(el, { reorder: false });
        }
      });
    }

    /**
     * @override of FormRegistrarMixin. Connects ValidateMixin
     * @param {FormRegisteringHost} el
     */
    removeFormElement(el) {
      super.removeFormElement(el);
      this.validate({ clearCurrentResult: true });
    }
  };

const FormGroupMixin = dedupeMixin(FormGroupMixinImplementation);

/**
 * LionInput: extension of lion-field with native input element in place and user friendly API.
 *
 * @customElement lion-input
 */
class LionInput extends NativeTextFieldMixin(
  /** @type {typeof import('@lion/form-core/types/NativeTextFieldMixinTypes').NativeTextField} */ (LionField),
) {
  /** @type {any} */
  static get properties() {
    return {
      /**
       * A Boolean attribute which, if present, indicates that the user should not be able to edit
       * the value of the input. The difference between disabled and readonly is that read-only
       * controls can still function, whereas disabled controls generally do not function as
       * controls until they are enabled.
       *
       * (From: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#attr-readonly)
       */
      readOnly: {
        type: Boolean,
        attribute: 'readonly',
        reflect: true,
      },
      type: {
        type: String,
        reflect: true,
      },
      placeholder: {
        type: String,
        reflect: true,
      },
    };
  }

  get slots() {
    return {
      ...super.slots,
      input: () => {
        // TODO: Find a better way to do value delegation via attr
        const native = document.createElement('input');
        const value = this.getAttribute('value');
        if (value) {
          native.setAttribute('value', value);
        }
        return native;
      },
    };
  }

  get _inputNode() {
    return /** @type {HTMLInputElement} */ (super._inputNode); // casts type
  }

  constructor() {
    super();
    this.readOnly = false;
    this.type = 'text';
    this.placeholder = '';
  }

  /**
   * @param {PropertyKey} name
   * @param {?} oldValue
   */
  requestUpdateInternal(name, oldValue) {
    super.requestUpdateInternal(name, oldValue);
    if (name === 'readOnly') {
      this.__delegateReadOnly();
    }
  }

  /** @param {import('@lion/core').PropertyValues } changedProperties */
  firstUpdated(changedProperties) {
    super.firstUpdated(changedProperties);
    this.__delegateReadOnly();
  }

  /** @param {import('@lion/core').PropertyValues } changedProperties */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('type')) {
      this._inputNode.type = this.type;
    }

    if (changedProperties.has('placeholder')) {
      this._inputNode.placeholder = this.placeholder;
    }

    if (changedProperties.has('disabled')) {
      this._inputNode.disabled = this.disabled;
      this.validate();
    }

    if (changedProperties.has('name')) {
      this._inputNode.name = this.name;
    }

    if (changedProperties.has('autocomplete')) {
      this._inputNode.autocomplete = /** @type {string} */ (this.autocomplete);
    }
  }

  __delegateReadOnly() {
    if (this._inputNode) {
      this._inputNode.readOnly = this.readOnly;
    }
  }
}

customElements.define('lion-input', LionInput);

/**
 * Compares if two days are the same
 *
 * @param {Date} day1
 * @param {Date} day2
 *
 * @returns {boolean}
 */
function isSameDate(day1, day2) {
  return (
    day1 instanceof Date &&
    day2 instanceof Date &&
    day1.getDate() === day2.getDate() &&
    day1.getMonth() === day2.getMonth() &&
    day1.getFullYear() === day2.getFullYear()
  );
}

const calendarStyle = css`
  :host {
    display: block;
  }

  :host([hidden]) {
    display: none;
  }

  .calendar {
    display: block;
  }

  .calendar__navigation {
    padding: 0 8px;
  }

  .calendar__navigation__month,
  .calendar__navigation__year {
    display: flex;
  }

  .calendar__navigation-heading {
    margin: 0.5em 0;
  }

  .calendar__previous-button,
  .calendar__next-button {
    background-color: #fff;
    border: 0;
    padding: 0;
    min-width: 40px;
    min-height: 40px;
  }

  .calendar__grid {
    width: 100%;
    padding: 8px 8px;
  }

  .calendar__weekday-header {
  }

  .calendar__day-cell {
    text-align: center;
  }

  .calendar__day-button {
    background-color: #fff;
    border: 0;
    color: black;
    padding: 0;
    min-width: 40px;
    min-height: 40px;
  }

  .calendar__day-button__text {
    pointer-events: none;
  }

  .calendar__day-button[today] {
    text-decoration: underline;
  }

  .calendar__day-button[selected] {
    background: #ccc;
  }

  .calendar__day-button[previous-month],
  .calendar__day-button[next-month] {
    color: rgb(115, 115, 115);
  }

  .calendar__day-button:hover {
    border: 1px solid green;
  }

  .calendar__day-button[disabled] {
    background-color: #fff;
    color: #eee;
    outline: none;
  }
`;

/**
 * @param {Date} date,
 * @returns {import('../../types/day').Day} day
 */
function createDay(
  date = new Date(),
  {
    weekOrder = 0,
    central = false,
    startOfWeek = false,
    selected = false,
    previousMonth = false,
    currentMonth = false,
    nextMonth = false,
    past = false,
    today = false,
    future = false,
    disabled = false,
  } = {},
) {
  return {
    weekOrder,
    central,
    date,
    startOfWeek,
    selected,
    previousMonth,
    currentMonth,
    nextMonth,
    past,
    today,
    future,
    disabled,
    tabindex: '-1',
    ariaPressed: 'false',
    ariaCurrent: undefined,
  };
}

/**
 * @param {Date} date
 * @param {Object} opts
 * @param {number} [opts.firstDayOfWeek]
 * @returns {import('../../types/day').Week}
 */
function createWeek(date, { firstDayOfWeek = 0 } = {}) {
  if (Object.prototype.toString.call(date) !== '[object Date]') {
    throw new Error('invalid date provided');
  }
  let weekStartDate = new Date(date);

  const tmpDate = new Date(date);
  while (tmpDate.getDay() !== firstDayOfWeek) {
    tmpDate.setDate(tmpDate.getDate() - 1);
    weekStartDate = new Date(tmpDate);
  }

  const week = {
    /** @type {import('../../types/day').Day[]} */
    days: [],
  };
  for (let i = 0; i < 7; i += 1) {
    if (i !== 0) {
      weekStartDate.setDate(weekStartDate.getDate() + 1);
    }
    week.days.push(
      createDay(new Date(weekStartDate), {
        weekOrder: i,
        startOfWeek: i === 0,
      }),
    );
  }
  return week;
}

/**
 *
 * @param {Date} date
 * @param {Object} opts
 * @param {number} [opts.firstDayOfWeek]
 * @returns {import('../../types/day').Month}
 */
function createMonth(date, { firstDayOfWeek = 0 } = {}) {
  if (Object.prototype.toString.call(date) !== '[object Date]') {
    throw new Error('invalid date provided');
  }
  const firstDayOfMonth = new Date(date);
  firstDayOfMonth.setDate(1);
  const monthNumber = firstDayOfMonth.getMonth();
  const weekOptions = { firstDayOfWeek };

  const month = {
    /** @type {{days: import('../../types/day').Day[]}[]} */
    weeks: [],
  };

  let nextWeek = createWeek(firstDayOfMonth, weekOptions);
  do {
    month.weeks.push(nextWeek);
    const firstDayOfNextWeek = new Date(nextWeek.days[6].date); // last day of current week
    firstDayOfNextWeek.setDate(firstDayOfNextWeek.getDate() + 1); // make it first day of next week
    nextWeek = createWeek(firstDayOfNextWeek, weekOptions);
  } while (nextWeek.days[0].date.getMonth() === monthNumber);

  return month;
}

/**
 *
 * @param {Date} date
 * @return {{months: import('../../types/day').Month[]}}
 */
function createMultipleMonth(
  date,
  { firstDayOfWeek = 0, pastMonths = 0, futureMonths = 0 } = {},
) {
  const multipleMonths = {
    /** @type {{weeks: {days: import('../../types/day').Day[]}[]}[]} */
    months: [],
  };

  for (let i = pastMonths; i > 0; i -= 1) {
    const pastDate = new Date(date);
    pastDate.setMonth(pastDate.getMonth() - i);
    multipleMonths.months.push(createMonth(pastDate, { firstDayOfWeek }));
  }

  multipleMonths.months.push(createMonth(date, { firstDayOfWeek }));

  for (let i = 0; i < futureMonths; i += 1) {
    const futureDate = new Date(date);
    futureDate.setMonth(futureDate.getMonth() + (i + 1));
    multipleMonths.months.push(createMonth(futureDate, { firstDayOfWeek }));
  }

  return multipleMonths;
}

const defaultMonthLabels = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const firstWeekDays = [1, 2, 3, 4, 5, 6, 7];
const lastDaysOfYear = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 *
 * @param {import('../../types/day').Day} day
 * @param {{ weekdays: string[], monthsLabels?: string[] }} opts
 */
function dayTemplate(day, { weekdays, monthsLabels = defaultMonthLabels }) {
  const dayNumber = day.date.getDate();
  const monthName = monthsLabels[day.date.getMonth()];
  const year = day.date.getFullYear();
  const weekdayName = day.weekOrder ? weekdays[day.weekOrder] : weekdays[0];

  const firstDay = dayNumber === 1;
  const endOfFirstWeek = day.weekOrder === 6 && firstWeekDays.includes(dayNumber);
  const startOfFirstFullWeek = day.startOfWeek && firstWeekDays.includes(dayNumber);

  if (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) {
    lastDaysOfYear[1] = 29;
  }
  const lastDayNumber = lastDaysOfYear[day.date.getMonth()];
  const lastWeekDays = [];
  for (let i = lastDayNumber; i >= lastDayNumber - 7; i -= 1) {
    lastWeekDays.push(i);
  }
  const endOfLastFullWeek = day.weekOrder === 6 && lastWeekDays.includes(dayNumber);
  const startOfLastWeek = day.startOfWeek && lastWeekDays.includes(dayNumber);
  const lastDay = lastDayNumber === dayNumber;

  return html`
    <td
      role="gridcell"
      class="calendar__day-cell"
      ?current-month=${day.currentMonth}
      ?first-day=${firstDay}
      ?end-of-first-week=${endOfFirstWeek}
      ?start-of-first-full-week=${startOfFirstFullWeek}
      ?end-of-last-full-week=${endOfLastFullWeek}
      ?start-of-last-week=${startOfLastWeek}
      ?last-day=${lastDay}
    >
      <button
        .date=${day.date}
        class="calendar__day-button"
        tabindex=${ifDefined(day.tabindex)}
        aria-label=${`${dayNumber} ${monthName} ${year} ${weekdayName}`}
        aria-pressed=${ifDefined(day.ariaPressed)}
        aria-current=${ifDefined(day.ariaCurrent)}
        ?disabled=${day.disabled}
        ?selected=${day.selected}
        ?past=${day.past}
        ?today=${day.today}
        ?future=${day.future}
        ?previous-month=${day.previousMonth}
        ?current-month=${day.currentMonth}
        ?next-month=${day.nextMonth}
      >
        <span class="calendar__day-button__text"> ${day.date.getDate()} </span>
      </button>
    </td>
  `;
}

/**
 * @param {{months: {weeks: {days: import('../../types/day').Day[]}[]}[]}} data
 * @param {{ weekdaysShort: string[], weekdays: string[], monthsLabels?: string[], dayTemplate?: (day: import('../../types/day').Day, { weekdays, monthsLabels }?: any) => import('@lion/core').TemplateResult }} opts
 */
function dataTemplate(
  data,
  { weekdaysShort, weekdays, monthsLabels, dayTemplate: dayTemplate$1 = dayTemplate },
) {
  return html`
    <div id="js-content-wrapper">
      ${data.months.map(
        month => html`
          <table
            role="grid"
            data-wrap-cols
            aria-readonly="true"
            class="calendar__grid"
            aria-labelledby="month year"
          >
            <thead>
              <tr role="row">
                ${weekdaysShort.map(
                  (header, i) => html`
                    <th
                      role="columnheader"
                      class="calendar__weekday-header"
                      scope="col"
                      aria-label="${weekdays[i]}"
                    >
                      ${header}
                    </th>
                  `,
                )}
              </tr>
            </thead>
            <tbody>
              ${month.weeks.map(
                week => html`
                  <tr role="row">
                    ${week.days.map(day =>
                      dayTemplate$1(day, { weekdaysShort, weekdays, monthsLabels }),
                    )}
                  </tr>
                `,
              )}
            </tbody>
          </table>
        `,
      )}
    </div>
  `;
}

/**
 * Gives the first day of the next month
 *
 * @param {Date} date
 *
 * @returns {Date}
 */
function getFirstDayNextMonth(date) {
  const result = new Date(date);
  result.setDate(1);
  result.setMonth(date.getMonth() + 1);
  return result;
}

/**
 * Gives the last day of the previous month
 *
 * @param {Date} date
 *
 * @returns {Date}
 */
function getLastDayPreviousMonth(date) {
  const previous = new Date(date);
  previous.setDate(0);
  return new Date(previous);
}

/**
 * @typedef {import('../types/day').Day} Day
 * @typedef {import('../types/day').Week} Week
 * @typedef {import('../types/day').Month} Month
 */

/**
 * @customElement lion-calendar
 */
class LionCalendar extends LocalizeMixin(LitElement) {
  static get localizeNamespaces() {
    return [
      {
        'lion-calendar': /** @param {string} locale */ locale => {
          switch (locale) {
            case 'bg-BG':
              return import('./bg-4b93e17e.js');
            case 'cs-CZ':
              return import('./cs-27df0519.js');
            case 'de-AT':
            case 'de-DE':
              return import('./de-8299b7ed.js');
            case 'en-AU':
            case 'en-GB':
            case 'en-PH':
            case 'en-US':
              return import('./en-d3aaf1b9.js');
            case 'es-ES':
              return import('./es-8af66a77.js');
            case 'fr-FR':
            case 'fr-BE':
              return import('./fr-c96dc73e.js');
            case 'hu-HU':
              return import('./hu-526d6cd8.js');
            case 'it-IT':
              return import('./it-6a933311.js');
            case 'nl-BE':
            case 'nl-NL':
              return import('./nl-ca956757.js');
            case 'pl-PL':
              return import('./pl-b76d5ac7.js');
            case 'ro-RO':
              return import('./ro-c9a779c7.js');
            case 'ru-RU':
              return import('./ru-326221c7.js');
            case 'sk-SK':
              return import('./sk-8482fc56.js');
            case 'uk-UA':
              return import('./uk-657bc949.js');
            case 'zh-CN':
              return import('./zh-1749d209.js');
            default:
              return import('./en-d3aaf1b9.js');
          }
        },
      },
      ...super.localizeNamespaces,
    ];
  }

  static get properties() {
    return {
      /**
       * Minimum date. All dates before will be disabled
       */
      minDate: { attribute: false },

      /**
       * Maximum date. All dates after will be disabled
       */
      maxDate: { attribute: false },

      /**
       * Disable certain dates
       */
      disableDates: { attribute: false },

      /**
       * The selected date, usually synchronized with datepicker-input
       * Not to be confused with the focused date (therefore not necessarily in active month view)
       */
      selectedDate: { attribute: false },

      /**
       * The date that
       * 1. determines the currently visible month
       * 2. will be focused when the month grid gets focused by the keyboard
       */
      centralDate: { attribute: false },

      /**
       * Weekday that will be displayed in first column of month grid.
       * 0: sunday, 1: monday, 2: tuesday, 3: wednesday , 4: thursday, 5: friday, 6: saturday
       * Default is 0
       */
      firstDayOfWeek: { attribute: false },

      /**
       * Weekday header notation, based on Intl DatetimeFormat:
       * - 'long' (e.g., Thursday)
       * - 'short' (e.g., Thu)
       * - 'narrow' (e.g., T).
       * Default is 'short'
       */
      weekdayHeaderNotation: { attribute: false },

      /**
       * Different locale for this component scope
       */
      locale: { attribute: false },

      /**
       * The currently focused date (if any)
       */
      __focusedDate: { attribute: false },

      /**
       * Data to render current month grid
       */
      __data: { attribute: false },
    };
  }

  constructor() {
    super();
    /** @type {{months: Month[]}} */
    this.__data = { months: [] };
    this.minDate = new Date(0);
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date
    this.maxDate = new Date(8640000000000000);
    /** @param {Day} day */
    this.dayPreprocessor = day => day;

    /** @param {Date} day */
    // eslint-disable-next-line no-unused-vars
    this.disableDates = day => false;

    this.firstDayOfWeek = 0;
    this.weekdayHeaderNotation = 'short';
    this.__today = normalizeDateTime(new Date());
    /** @type {Date} */
    this.centralDate = this.__today;
    /** @type {Date | null} */
    this.__focusedDate = null;
    this.__connectedCallbackDone = false;
    this.__eventsAdded = false;
    this.locale = '';
    this.__boundKeyboardNavigationEvent = this.__keyboardNavigationEvent.bind(this);
    this.__boundClickDateDelegation = this.__clickDateDelegation.bind(this);
    this.__boundFocusDateDelegation = this.__focusDateDelegation.bind(this);
    this.__boundBlurDateDelegation = this.__focusDateDelegation.bind(this);
  }

  static get styles() {
    return [calendarStyle];
  }

  render() {
    return html`
      <div class="calendar" role="application">
        ${this.__renderNavigation()} ${this.__renderData()}
      </div>
    `;
  }

  get focusedDate() {
    return this.__focusedDate;
  }

  goToNextMonth() {
    this.__modifyDate(1, { dateType: 'centralDate', type: 'Month', mode: 'both' });
  }

  goToPreviousMonth() {
    this.__modifyDate(-1, { dateType: 'centralDate', type: 'Month', mode: 'both' });
  }

  goToNextYear() {
    this.__modifyDate(1, { dateType: 'centralDate', type: 'FullYear', mode: 'both' });
  }

  goToPreviousYear() {
    this.__modifyDate(-1, { dateType: 'centralDate', type: 'FullYear', mode: 'both' });
  }

  /**
   * @param {Date} date
   */
  async focusDate(date) {
    this.centralDate = date;
    await this.updateComplete;
    this.focusCentralDate();
  }

  focusCentralDate() {
    const button = /** @type {HTMLElement} */ (this.shadowRoot?.querySelector(
      'button[tabindex="0"]',
    ));
    button.focus();
    this.__focusedDate = this.centralDate;
  }

  async focusSelectedDate() {
    if (this.selectedDate) {
      await this.focusDate(this.selectedDate);
    }
  }

  async connectedCallback() {
    // eslint-disable-next-line wc/guard-super-call
    super.connectedCallback();

    this.__connectedCallbackDone = true;

    this.__calculateInitialCentralDate();

    // setup data for initial render
    this.__data = this.__createData();

    /**
     * This logic needs to happen on firstUpdated, but every time the DOM node is moved as well
     * since firstUpdated only runs once, this logic is moved here, but after updateComplete
     * this acts as a firstUpdated that runs on every reconnect as well
     */
    await this.updateComplete;

    /**
     * Flow goes like:
     * 1) first connectedCallback before updateComplete
     * 2) disconnectedCallback
     * 3) second connectedCallback before updateComplete
     * 4) first connectedCallback after updateComplete
     * 5) second connectedCallback after updateComplete
     *
     * The __eventsAdded property tracks whether events are added / removed and here
     * we can guard against adding events twice
     */
    if (!this.__eventsAdded) {
      this.__contentWrapperElement = /** @type {HTMLButtonElement} */ (this.shadowRoot?.getElementById(
        'js-content-wrapper',
      ));
      this.__contentWrapperElement.addEventListener('click', this.__boundClickDateDelegation);
      this.__contentWrapperElement.addEventListener('focus', this.__boundFocusDateDelegation);
      this.__contentWrapperElement.addEventListener('blur', this.__boundBlurDateDelegation);
      this.__contentWrapperElement.addEventListener('keydown', this.__boundKeyboardNavigationEvent);
      this.__eventsAdded = true;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.__contentWrapperElement) {
      this.__contentWrapperElement.removeEventListener('click', this.__boundClickDateDelegation);
      this.__contentWrapperElement.removeEventListener('focus', this.__boundFocusDateDelegation);
      this.__contentWrapperElement.removeEventListener('blur', this.__boundBlurDateDelegation);
      this.__contentWrapperElement.removeEventListener(
        'keydown',
        this.__boundKeyboardNavigationEvent,
      );

      this.__eventsAdded = false;
    }
  }

  /** @param {import('@lion/core').PropertyValues } changedProperties */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('__focusedDate') && this.__focusedDate) {
      this.focusCentralDate();
    }
  }

  /**
   * @param {string} name
   * @param {?} oldValue
   */
  requestUpdateInternal(name, oldValue) {
    super.requestUpdateInternal(name, oldValue);

    const map = {
      disableDates: () => this.__disableDatesChanged(),
      centralDate: () => this.__centralDateChanged(),
      __focusedDate: () => this.__focusedDateChanged(),
    };
    if (map[name]) {
      map[name]();
    }

    const updateDataOn = ['centralDate', 'minDate', 'maxDate', 'selectedDate', 'disableDates'];

    if (updateDataOn.includes(name) && this.__connectedCallbackDone) {
      this.__data = this.__createData();
    }
  }

  __calculateInitialCentralDate() {
    if (this.centralDate === this.__today && this.selectedDate) {
      // initialised with selectedDate only if user didn't provide another one
      this.centralDate = this.selectedDate;
    } else {
      this.__ensureValidCentralDate();
    }
  }

  /**
   * @param {string} month
   * @param {number} year
   */
  __renderMonthNavigation(month, year) {
    const nextMonth =
      this.centralDate.getMonth() === 11
        ? getMonthNames({ locale: this.__getLocale() })[0]
        : getMonthNames({ locale: this.__getLocale() })[this.centralDate.getMonth() + 1];
    const previousMonth =
      this.centralDate.getMonth() === 0
        ? getMonthNames({ locale: this.__getLocale() })[11]
        : getMonthNames({ locale: this.__getLocale() })[this.centralDate.getMonth() - 1];
    const nextYear = this.centralDate.getMonth() === 11 ? year + 1 : year;
    const previousYear = this.centralDate.getMonth() === 0 ? year - 1 : year;
    return html`
      <div class="calendar__navigation__month">
        ${this.__renderPreviousButton('Month', previousMonth, previousYear)}
        <h2 class="calendar__navigation-heading" id="month" aria-atomic="true">${month}</h2>
        ${this.__renderNextButton('Month', nextMonth, nextYear)}
      </div>
    `;
  }

  /**
   * @param {string} month
   * @param {number} year
   */
  __renderYearNavigation(month, year) {
    const nextYear = year + 1;
    const previousYear = year - 1;

    return html`
      <div class="calendar__navigation__year">
        ${this.__renderPreviousButton('FullYear', month, previousYear)}
        <h2 class="calendar__navigation-heading" id="year" aria-atomic="true">${year}</h2>
        ${this.__renderNextButton('FullYear', month, nextYear)}
      </div>
    `;
  }

  __renderNavigation() {
    const month = getMonthNames({ locale: this.__getLocale() })[this.centralDate.getMonth()];
    const year = this.centralDate.getFullYear();
    return html`
      <div class="calendar__navigation">
        ${this.__renderYearNavigation(month, year)} ${this.__renderMonthNavigation(month, year)}
      </div>
    `;
  }

  __renderData() {
    return dataTemplate(this.__data, {
      monthsLabels: getMonthNames({ locale: this.__getLocale() }),
      weekdaysShort: getWeekdayNames({
        locale: this.__getLocale(),
        style: this.weekdayHeaderNotation,
        firstDayOfWeek: this.firstDayOfWeek,
      }),
      weekdays: getWeekdayNames({
        locale: this.__getLocale(),
        style: 'long',
        firstDayOfWeek: this.firstDayOfWeek,
      }),
      dayTemplate,
    });
  }

  /**
   * @param {string} type
   * @param {string} previousMonth
   * @param {number} previousYear
   */
  __getPreviousDisabled(type, previousMonth, previousYear) {
    let disabled;
    let month = previousMonth;
    if (this.minDate && type === 'Month') {
      disabled = getLastDayPreviousMonth(this.centralDate) < this.minDate;
    } else if (this.minDate) {
      disabled = previousYear < this.minDate.getFullYear();
    }
    if (!disabled && this.minDate && type === 'FullYear') {
      // change the month to the first available month
      if (previousYear === this.minDate.getFullYear()) {
        if (this.centralDate.getMonth() < this.minDate.getMonth()) {
          month = getMonthNames({ locale: this.__getLocale() })[this.minDate.getMonth()];
        }
      }
    }
    return { disabled, month };
  }

  /**
   * @param {string} type
   * @param {string} nextMonth
   * @param {number} nextYear
   */
  __getNextDisabled(type, nextMonth, nextYear) {
    let disabled;
    let month = nextMonth;
    if (this.maxDate && type === 'Month') {
      disabled = getFirstDayNextMonth(this.centralDate) > this.maxDate;
    } else if (this.maxDate) {
      disabled = nextYear > this.maxDate.getFullYear();
    }
    if (!disabled && this.maxDate && type === 'FullYear') {
      // change the month to the first available month
      if (nextYear === this.maxDate.getFullYear()) {
        if (this.centralDate.getMonth() >= this.maxDate.getMonth()) {
          month = getMonthNames({ locale: this.__getLocale() })[this.maxDate.getMonth()];
        }
      }
    }
    return { disabled, month };
  }

  /**
   * @param {string} type
   * @param {string} previousMonth
   * @param {number} previousYear
   */
  __renderPreviousButton(type, previousMonth, previousYear) {
    const { disabled, month } = this.__getPreviousDisabled(type, previousMonth, previousYear);
    const previousButtonTitle = this.__getNavigationLabel('previous', type, month, previousYear);
    const clickDateDelegation = () => {
      if (type === 'FullYear') {
        this.goToPreviousYear();
      } else {
        this.goToPreviousMonth();
      }
    };

    return html`
      <button
        class="calendar__previous-button"
        aria-label=${previousButtonTitle}
        title=${previousButtonTitle}
        @click=${clickDateDelegation}
        ?disabled=${disabled}
      >
        &lt;
      </button>
    `;
  }

  /**
   * @param {string} type
   * @param {string} nextMonth
   * @param {number} nextYear
   */
  __renderNextButton(type, nextMonth, nextYear) {
    const { disabled, month } = this.__getNextDisabled(type, nextMonth, nextYear);
    const nextButtonTitle = this.__getNavigationLabel('next', type, month, nextYear);
    const clickDateDelegation = () => {
      if (type === 'FullYear') {
        this.goToNextYear();
      } else {
        this.goToNextMonth();
      }
    };

    return html`
      <button
        class="calendar__next-button"
        aria-label=${nextButtonTitle}
        title=${nextButtonTitle}
        @click=${clickDateDelegation}
        ?disabled=${disabled}
      >
        &gt;
      </button>
    `;
  }

  /**
   *
   * @param {string} mode
   * @param {string} type
   * @param {string} month
   * @param {number} year
   */
  __getNavigationLabel(mode, type, month, year) {
    return `${this.msgLit(`lion-calendar:${mode}${type}`)}, ${month} ${year}`;
  }

  /**
   *
   * @param {Day} _day
   * @param {*} param1
   */
  __coreDayPreprocessor(_day, { currentMonth = false } = {}) {
    const day = createDay(new Date(_day.date), _day);
    const today = normalizeDateTime(new Date());
    day.central = isSameDate(day.date, this.centralDate);
    const dayYearMonth = `${day.date.getFullYear()}${`0${day.date.getMonth() + 1}`.slice(-2)}`;
    const currentYearMonth =
      currentMonth && `${currentMonth.getFullYear()}${`0${currentMonth.getMonth() + 1}`.slice(-2)}`;
    day.previousMonth = currentMonth && dayYearMonth < currentYearMonth;
    day.currentMonth = currentMonth && dayYearMonth === currentYearMonth;
    day.nextMonth = currentMonth && dayYearMonth > currentYearMonth;
    day.selected = this.selectedDate ? isSameDate(day.date, this.selectedDate) : false;
    day.past = day.date < today;
    day.today = isSameDate(day.date, today);
    day.future = day.date > today;
    day.disabled = this.disableDates(day.date);
    day.tabindex = day.central ? '0' : '-1';
    day.ariaPressed = day.selected ? 'true' : 'false';
    day.ariaCurrent = day.today ? 'date' : undefined;

    if (this.minDate && normalizeDateTime(day.date) < normalizeDateTime(this.minDate)) {
      day.disabled = true;
    }

    if (this.maxDate && normalizeDateTime(day.date) > normalizeDateTime(this.maxDate)) {
      day.disabled = true;
    }

    return this.dayPreprocessor(day);
  }

  /**
   * @param {Day} [options]
   */
  __createData(options) {
    const data = createMultipleMonth(this.centralDate, {
      firstDayOfWeek: this.firstDayOfWeek,
      ...options,
    });
    data.months.forEach((month, monthi) => {
      month.weeks.forEach((week, weeki) => {
        week.days.forEach((day, dayi) => {
          // eslint-disable-next-line no-unused-vars
          const currentDay = data.months[monthi].weeks[weeki].days[dayi];
          const currentMonth = data.months[monthi].weeks[0].days[6].date;
          data.months[monthi].weeks[weeki].days[dayi] = this.__coreDayPreprocessor(currentDay, {
            currentMonth,
          });
        });
      });
    });
    return data;
  }

  __disableDatesChanged() {
    if (this.__connectedCallbackDone) {
      this.__ensureValidCentralDate();
    }
  }

  /**
   * @param {Date} selectedDate
   */
  __dateSelectedByUser(selectedDate) {
    this.selectedDate = selectedDate;
    this.__focusedDate = selectedDate;
    this.dispatchEvent(
      new CustomEvent('user-selected-date-changed', {
        detail: {
          selectedDate,
        },
      }),
    );
  }

  __centralDateChanged() {
    if (this.__connectedCallbackDone) {
      this.__ensureValidCentralDate();
    }
  }

  __focusedDateChanged() {
    if (this.__focusedDate) {
      this.centralDate = this.__focusedDate;
    }
  }

  __ensureValidCentralDate() {
    if (!this.__isEnabledDate(this.centralDate)) {
      this.centralDate = this.__findBestEnabledDateFor(this.centralDate);
    }
  }

  /**
   * @param {Date} date
   */
  __isEnabledDate(date) {
    const processedDay = this.__coreDayPreprocessor({ date });
    return !processedDay.disabled;
  }

  /**
   * @param {Date} date
   * @param {Object} opts
   * @param {String} [opts.mode] Find best date in `future/past/both`
   */
  __findBestEnabledDateFor(date, { mode = 'both' } = {}) {
    const futureDate =
      this.minDate && this.minDate > date ? new Date(this.minDate) : new Date(date);
    const pastDate = this.maxDate && this.maxDate < date ? new Date(this.maxDate) : new Date(date);

    if (this.minDate && this.minDate > date) {
      futureDate.setDate(futureDate.getDate() - 1);
    }
    if (this.maxDate && this.maxDate < date) {
      pastDate.setDate(pastDate.getDate() + 1);
    }

    let i = 0;
    do {
      i += 1;
      if (mode === 'both' || mode === 'future') {
        futureDate.setDate(futureDate.getDate() + 1);
        if (this.__isEnabledDate(futureDate)) {
          return futureDate;
        }
      }
      if (mode === 'both' || mode === 'past') {
        pastDate.setDate(pastDate.getDate() - 1);
        if (this.__isEnabledDate(pastDate)) {
          return pastDate;
        }
      }
    } while (i < 750); // 2 years+

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    throw new Error(
      `Could not find a selectable date within +/- 750 day for ${year}/${month}/${day}`,
    );
  }

  /**
   * @param {Event} ev
   */
  __clickDateDelegation(ev) {
    const isDayButton = /** @param {HTMLElement} el */ el =>
      el.classList.contains('calendar__day-button');

    const el = /** @type {HTMLElement & { date: Date }} */ (ev.target);
    if (isDayButton(el)) {
      this.__dateSelectedByUser(el.date);
    }
  }

  __focusDateDelegation() {
    const isDayButton = /** @param {HTMLElement} el */ el =>
      el.classList.contains('calendar__day-button');

    if (
      !this.__focusedDate &&
      isDayButton(/** @type {HTMLElement} el */ (this.shadowRoot?.activeElement))
    ) {
      this.__focusedDate = /** @type {HTMLButtonElement & { date: Date }} */ (this.shadowRoot
        ?.activeElement).date;
    }
  }

  __blurDateDelegation() {
    const isDayButton = /** @param {HTMLElement} el */ el =>
      el.classList.contains('calendar__day-button');

    setTimeout(() => {
      if (
        this.shadowRoot?.activeElement &&
        !isDayButton(/** @type {HTMLElement} el */ (this.shadowRoot?.activeElement))
      ) {
        this.__focusedDate = null;
      }
    }, 1);
  }

  /**
   * @param {KeyboardEvent} ev
   */
  __keyboardNavigationEvent(ev) {
    const preventedKeys = ['ArrowUp', 'ArrowDown', 'PageDown', 'PageUp'];

    if (preventedKeys.includes(ev.key)) {
      ev.preventDefault();
    }

    switch (ev.key) {
      case 'ArrowUp':
        this.__modifyDate(-7, { dateType: '__focusedDate', type: 'Date', mode: 'past' });
        break;
      case 'ArrowDown':
        this.__modifyDate(7, { dateType: '__focusedDate', type: 'Date', mode: 'future' });
        break;
      case 'ArrowLeft':
        this.__modifyDate(-1, { dateType: '__focusedDate', type: 'Date', mode: 'past' });
        break;
      case 'ArrowRight':
        this.__modifyDate(1, { dateType: '__focusedDate', type: 'Date', mode: 'future' });
        break;
      case 'PageDown':
        if (ev.altKey === true) {
          this.__modifyDate(1, { dateType: '__focusedDate', type: 'FullYear', mode: 'future' });
        } else {
          this.__modifyDate(1, { dateType: '__focusedDate', type: 'Month', mode: 'future' });
        }
        break;
      case 'PageUp':
        if (ev.altKey === true) {
          this.__modifyDate(-1, { dateType: '__focusedDate', type: 'FullYear', mode: 'past' });
        } else {
          this.__modifyDate(-1, { dateType: '__focusedDate', type: 'Month', mode: 'past' });
        }
        break;
      case 'Tab':
        this.__focusedDate = null;
        break;
      // no default
    }
  }

  /**
   *
   * @param {number} modify
   * @param {Object} opts
   * @param {string} opts.dateType
   * @param {string} opts.type
   * @param {string} opts.mode
   */
  __modifyDate(modify, { dateType, type, mode }) {
    let tmpDate = new Date(this.centralDate);
    // if we're not working with days, reset
    // day count to first day of the month
    if (type !== 'Date') {
      tmpDate.setDate(1);
    }
    tmpDate[`set${type}`](tmpDate[`get${type}`]() + modify);
    // if we've reset the day count,
    // restore day count as best we can
    if (type !== 'Date') {
      const maxDays = new Date(tmpDate.getFullYear(), tmpDate.getMonth() + 1, 0).getDate();
      tmpDate.setDate(Math.min(this.centralDate.getDate(), maxDays));
    }
    if (!this.__isEnabledDate(tmpDate)) {
      tmpDate = this.__findBestEnabledDateFor(tmpDate, { mode });
    }
    this[dateType] = tmpDate;
  }

  __getLocale() {
    return this.locale || localize.locale;
  }
}

/**
 * @param {Date|number} date
 */
function isValidDate(date) {
  // to make sure it is a valid date we use isNaN and not Number.isNaN
  // @ts-ignore dirty hack, you're not supposed to pass Date instances to isNaN
  // eslint-disable-next-line no-restricted-globals
  return date instanceof Date && !isNaN(date);
}

/**
 * `LionInputDate` has a .modelValue of type Date. It parses, formats and validates based
 * on locale.
 *
 * @customElement lion-input-date
 */
class LionInputDate extends LocalizeMixin(LionInput) {
  /** @type {any} */
  static get properties() {
    return {
      modelValue: Date,
    };
  }

  constructor() {
    super();
    /**
     * @param {string} value
     */
    this.parser = value => (value === '' ? undefined : parseDate(value));
    this.formatter = formatDate;
    this.defaultValidators.push(new IsDate());
  }

  /** @param {import('@lion/core').PropertyValues } changedProperties */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('locale')) {
      this._calculateValues({ source: null });
    }
  }

  connectedCallback() {
    // eslint-disable-next-line wc/guard-super-call
    super.connectedCallback();
    this.type = 'text';
  }

  /**
   * @param {Date} modelValue
   */
  // eslint-disable-next-line class-methods-use-this
  serializer(modelValue) {
    if (!isValidDate(modelValue)) {
      return '';
    }
    // modelValue is localized, so we take the timezone offset in milliseconds and subtract it
    // before converting it to ISO string.
    const offset = modelValue.getTimezoneOffset() * 60000;
    return new Date(modelValue.getTime() - offset).toISOString().slice(0, 10);
  }

  /**
   * @param {string} serializedValue
   */
  // eslint-disable-next-line class-methods-use-this
  deserializer(serializedValue) {
    return new Date(serializedValue);
  }
}

const globalOverlaysStyle = css`
  .global-overlays {
    position: fixed;
    z-index: 200;
  }

  .global-overlays__overlay {
    pointer-events: auto;
  }

  .global-overlays__overlay-container {
    display: flex;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .global-overlays__overlay-container--top-left {
    justify-content: flex-start;
    align-items: flex-start;
  }

  .global-overlays__overlay-container--top {
    justify-content: center;
    align-items: flex-start;
  }

  .global-overlays__overlay-container--top-right {
    justify-content: flex-end;
    align-items: flex-start;
  }

  .global-overlays__overlay-container--right {
    justify-content: flex-end;
    align-items: center;
  }

  .global-overlays__overlay-container--bottom-left {
    justify-content: flex-start;
    align-items: flex-end;
  }

  .global-overlays__overlay-container--bottom {
    justify-content: center;
    align-items: flex-end;
  }

  .global-overlays__overlay-container--bottom-right {
    justify-content: flex-end;
    align-items: flex-end;
  }
  .global-overlays__overlay-container--left {
    justify-content: flex-start;
    align-items: center;
  }

  .global-overlays__overlay-container--center {
    justify-content: center;
    align-items: center;
  }

  .global-overlays__overlay--bottom-sheet {
    width: 100%;
  }

  .global-overlays .global-overlays__backdrop {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    background-color: #333333;
    opacity: 0.3;
    display: none;
  }

  .global-overlays .global-overlays__backdrop--visible {
    display: block;
  }

  .global-overlays .global-overlays__backdrop--animation-in {
    animation: global-overlays-backdrop-fade-in 300ms;
  }

  .global-overlays .global-overlays__backdrop--animation-out {
    animation: global-overlays-backdrop-fade-out 300ms;
    opacity: 0;
  }

  @keyframes global-overlays-backdrop-fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes global-overlays-backdrop-fade-out {
    from {
      opacity: 0.3;
    }
  }

  body > *[inert] {
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
    pointer-events: none;
  }

  body.global-overlays-scroll-lock {
    overflow: hidden;
  }

  body.global-overlays-scroll-lock-ios-fix {
    position: fixed;
    width: 100%;
  }
`;

/**
 * Use the [inert] attribute to be forwards compatible with: https://html.spec.whatwg.org/multipage/interaction.html#inert
 */

/**
 * Makes sibling elements inert, sets the inert attribute and aria-hidden for
 * screen readers.
 * @param {HTMLElement} element
 */
function setSiblingsInert(element) {
  const parentChildren = /** @type {HTMLCollection} */ (element.parentElement?.children);
  for (let i = 0; i < parentChildren.length; i += 1) {
    const sibling = parentChildren[i];

    if (sibling !== element) {
      sibling.setAttribute('inert', '');
      sibling.setAttribute('aria-hidden', 'true');
    }
  }
}

/**
 * Removes inert and aria-hidden attribute from sibling elements
 * @param {HTMLElement} element
 */
function unsetSiblingsInert(element) {
  const parentChildren = /** @type {HTMLCollection} */ (element.parentElement?.children);
  for (let i = 0; i < parentChildren.length; i += 1) {
    const sibling = parentChildren[i];

    if (sibling !== element) {
      sibling.removeAttribute('inert');
      sibling.removeAttribute('aria-hidden');
    }
  }
}

/**
 * @typedef {import('./OverlayController.js').OverlayController} OverlayController
 */

const isIOS = navigator.userAgent.match(/iPhone|iPad|iPod/i);

/**
 * `OverlaysManager` which manages overlays which are rendered into the body
 */
class OverlaysManager {
  static __createGlobalRootNode() {
    const rootNode = document.createElement('div');
    rootNode.classList.add('global-overlays');
    document.body.appendChild(rootNode);
    return rootNode;
  }

  static __createGlobalStyleNode() {
    const styleTag = document.createElement('style');
    styleTag.setAttribute('data-global-overlays', '');
    styleTag.textContent = globalOverlaysStyle.cssText;
    document.head.appendChild(styleTag);
    return styleTag;
  }

  /**
   * no setter as .list is intended to be read-only
   * You can use .add or .remove to modify it
   */
  // eslint-disable-next-line class-methods-use-this
  get globalRootNode() {
    if (!OverlaysManager.__globalRootNode) {
      OverlaysManager.__globalRootNode = OverlaysManager.__createGlobalRootNode();
      OverlaysManager.__globalStyleNode = OverlaysManager.__createGlobalStyleNode();
    }
    return OverlaysManager.__globalRootNode;
  }

  /**
   * no setter as .list is intended to be read-only
   * You can use .add or .remove to modify it
   */
  get list() {
    return this.__list;
  }

  /**
   * no setter as .shownList is intended to be read-only
   * You can use .show or .hide on individual controllers to modify
   */
  get shownList() {
    return this.__shownList;
  }

  constructor() {
    /** @type {OverlayController[]} */
    this.__list = [];
    /** @type {OverlayController[]} */
    this.__shownList = [];
    this.__siblingsInert = false;
    /** @type {WeakMap<OverlayController, OverlayController[]>} */
    this.__blockingMap = new WeakMap();
  }

  /**
   * Registers an overlay controller.
   * @param {OverlayController} ctrlToAdd controller of the newly added overlay
   * @returns {OverlayController} same controller after adding to the manager
   */
  add(ctrlToAdd) {
    if (this.list.find(ctrl => ctrlToAdd === ctrl)) {
      throw new Error('controller instance is already added');
    }
    this.list.push(ctrlToAdd);
    return ctrlToAdd;
  }

  /**
   * @param {OverlayController} ctrlToRemove
   */
  remove(ctrlToRemove) {
    if (!this.list.find(ctrl => ctrlToRemove === ctrl)) {
      throw new Error('could not find controller to remove');
    }
    this.__list = this.list.filter(ctrl => ctrl !== ctrlToRemove);
  }

  /**
   * @param {OverlayController} ctrlToShow
   */
  show(ctrlToShow) {
    if (this.list.find(ctrl => ctrlToShow === ctrl)) {
      this.hide(ctrlToShow);
    }
    this.__shownList.unshift(ctrlToShow);

    // make sure latest shown ctrl is visible
    Array.from(this.__shownList)
      .reverse()
      .forEach((ctrl, i) => {
        // eslint-disable-next-line no-param-reassign
        ctrl.elevation = i + 1;
      });
  }

  /**
   * @param {any} ctrlToHide
   */
  hide(ctrlToHide) {
    if (!this.list.find(ctrl => ctrlToHide === ctrl)) {
      throw new Error('could not find controller to hide');
    }
    this.__shownList = this.shownList.filter(ctrl => ctrl !== ctrlToHide);
  }

  teardown() {
    this.list.forEach(ctrl => {
      ctrl.teardown();
    });

    this.__list = [];
    this.__shownList = [];
    this.__siblingsInert = false;

    const rootNode = OverlaysManager.__globalRootNode;
    if (rootNode) {
      if (rootNode.parentElement) {
        rootNode.parentElement.removeChild(rootNode);
      }
      OverlaysManager.__globalRootNode = undefined;

      document.head.removeChild(
        /** @type {HTMLStyleElement} */ (OverlaysManager.__globalStyleNode),
      );
      OverlaysManager.__globalStyleNode = undefined;
    }
  }

  /** Features right now only for Global Overlay Manager */

  get siblingsInert() {
    return this.__siblingsInert;
  }

  disableTrapsKeyboardFocusForAll() {
    this.shownList.forEach(ctrl => {
      if (ctrl.trapsKeyboardFocus === true && ctrl.disableTrapsKeyboardFocus) {
        ctrl.disableTrapsKeyboardFocus({ findNewTrap: false });
      }
    });
  }

  /**
   * @param {'local' | 'global' | undefined} placementMode
   */
  informTrapsKeyboardFocusGotEnabled(placementMode) {
    if (this.siblingsInert === false && placementMode === 'global') {
      if (OverlaysManager.__globalRootNode) {
        setSiblingsInert(this.globalRootNode);
      }
      this.__siblingsInert = true;
    }
  }

  // @ts-ignore
  informTrapsKeyboardFocusGotDisabled({ disabledCtrl, findNewTrap = true } = {}) {
    const next = this.shownList.find(
      ctrl => ctrl !== disabledCtrl && ctrl.trapsKeyboardFocus === true,
    );
    if (next) {
      if (findNewTrap) {
        next.enableTrapsKeyboardFocus();
      }
    } else if (this.siblingsInert === true) {
      if (OverlaysManager.__globalRootNode) {
        unsetSiblingsInert(this.globalRootNode);
      }
      this.__siblingsInert = false;
    }
  }

  /** PreventsScroll */

  // eslint-disable-next-line class-methods-use-this
  requestToPreventScroll() {
    // no check as classList will dedupe it anyways
    document.body.classList.add('global-overlays-scroll-lock');
    if (isIOS) {
      // iOS has issues with overlays with input fields. This is fixed by applying
      // position: fixed to the body. As a side effect, this will scroll the body to the top.
      document.body.classList.add('global-overlays-scroll-lock-ios-fix');
    }
  }

  requestToEnableScroll() {
    if (!this.shownList.some(ctrl => ctrl.preventsScroll === true)) {
      document.body.classList.remove('global-overlays-scroll-lock');
      if (isIOS) {
        document.body.classList.remove('global-overlays-scroll-lock-ios-fix');
      }
    }
  }

  /**
   * Blocking
   * @param {OverlayController} blockingCtrl
   */
  requestToShowOnly(blockingCtrl) {
    const controllersToHide = this.shownList.filter(ctrl => ctrl !== blockingCtrl);

    controllersToHide.map(ctrl => ctrl.hide());
    this.__blockingMap.set(blockingCtrl, controllersToHide);
  }

  /**
   * @param {OverlayController} blockingCtrl
   */
  retractRequestToShowOnly(blockingCtrl) {
    if (this.__blockingMap.has(blockingCtrl)) {
      const controllersWhichGotHidden = /** @type {OverlayController[]} */ (this.__blockingMap.get(
        blockingCtrl,
      ));
      controllersWhichGotHidden.map(ctrl => ctrl.show());
    }
  }
}
/** @type {HTMLElement | undefined} */
OverlaysManager.__globalRootNode = undefined;
/** @type {HTMLStyleElement | undefined} */
OverlaysManager.__globalStyleNode = undefined;

// eslint-disable-next-line import/no-mutable-exports
let overlays =
  singletonManager.get('@lion/overlays::overlays::0.15.x') || new OverlaysManager();

/**
 * Returns the activeElement, even when they are inside a shadowRoot.
 * (If an element in a shadowRoot is focused, document.activeElement
 * returns the shadowRoot host.
 *
 * @returns {Element}
 */
function getDeepActiveElement() {
  let host = document.activeElement || document.body;
  while (host && host.shadowRoot && host.shadowRoot.activeElement) {
    host = host.shadowRoot.activeElement;
  }
  return host;
}

/**
 * @param {CSSStyleDeclaration} styles
 */
const hasStyleVisibility = ({ visibility, display }) =>
  visibility !== 'hidden' && display !== 'none';

/**
 * @param {HTMLElement} element
 * @returns {boolean} Whether the element is visible
 */
function isVisible(element) {
  if (!element) {
    return false;
  }

  // Check if element is connected to the DOM
  if (!element.isConnected) {
    return false;
  }

  // Check inline styles to avoid a reflow
  // matches display: none, visibility: hidden on element
  if (!hasStyleVisibility(element.style)) {
    return false;
  }

  // Check computed styles
  // matches display: none, visbility: hidden on element and visibility: hidden from parent
  if (!hasStyleVisibility(window.getComputedStyle(element))) {
    return false;
  }

  // display: none is not inherited, so finally check if element has calculated width or height
  // matches display: none from parent
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

/**
 * Implementation based on:
 * https://github.com/PolymerElements/iron-overlay-behavior/blob/master/iron-focusables-helper.html
 * The original implementation does not work for non-Polymer web components, and contains several
 * bugs on IE11.
 */

/**
 * @param {HTMLElement} a
 * @param {HTMLElement} b
 * @returns {Boolean}
 */
function hasLowerTabOrder(a, b) {
  // Normalize tabIndexes
  // e.g. in Firefox `<div contenteditable>` has `tabIndex = -1`
  const ati = Math.max(a.tabIndex, 0);
  const bti = Math.max(b.tabIndex, 0);
  return ati === 0 || bti === 0 ? bti > ati : ati > bti;
}

/**
 * @param {HTMLElement[]} left
 * @param {HTMLElement[]} right
 * @returns {HTMLElement[]}
 */
function mergeSortByTabIndex(left, right) {
  /** @type {HTMLElement[]} */
  const result = [];
  while (left.length > 0 && right.length > 0) {
    if (hasLowerTabOrder(left[0], right[0])) {
      // @ts-ignore
      result.push(right.shift());
    } else {
      // @ts-ignore
      result.push(left.shift());
    }
  }

  return [...result, ...left, ...right];
}

/**
 * @param {HTMLElement[]} elements
 * @returns {HTMLElement[]}
 */
function sortByTabIndex(elements) {
  // Implement a merge sort as Array.prototype.sort does a non-stable sort
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
  const len = elements.length;
  if (len < 2) {
    return elements;
  }

  const pivot = Math.ceil(len / 2);
  const left = sortByTabIndex(elements.slice(0, pivot));
  const right = sortByTabIndex(elements.slice(pivot));
  return mergeSortByTabIndex(left, right);
}

/**
 * Implementation based on: https://github.com/PolymerElements/iron-overlay-behavior/blob/master/iron-focusables-helper.html
 * The original implementation does not work for non-Polymer web components,
 * and contains several bugs on IE11.
 */

// IE11 supports matches as 'msMatchesSelector'
const matchesFunc = 'matches' in Element.prototype ? 'matches' : 'msMatchesSelector';

/**
 * @param {HTMLElement} element
 * @returns {boolean} Whether the element matches
 */
function isFocusable(element) {
  // Elements that cannot be focused if they have [disabled] attribute.
  if (element[matchesFunc]('input, select, textarea, button, object')) {
    return element[matchesFunc](':not([disabled])');
  }

  // Elements that can be focused even if they have [disabled] attribute.
  return element[matchesFunc]('a[href], area[href], iframe, [tabindex], [contentEditable]');
}

/**
 * @param {HTMLElement} element
 * @returns {Number}
 */
function getTabindex(element) {
  if (isFocusable(element)) {
    return Number(element.getAttribute('tabindex') || 0);
  }
  return -1;
}

/**
 * @param {HTMLElement|HTMLSlotElement} element
 */
function getChildNodes(element) {
  if (element.localName === 'slot') {
    const slot = /** @type {HTMLSlotElement} */ (element);
    return slot.assignedNodes({ flatten: true });
  }

  const { children } = element.shadowRoot || element;
  // On IE11, SVGElement.prototype.children is undefined
  return children || [];
}

/**
 * @param {Element} element
 * @returns {boolean}
 */
function isVisibleElement(element) {
  if (element.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  // A slot is not visible, but it's children might so we need
  // to treat is as such.
  if (element.localName === 'slot') {
    return true;
  }

  return isVisible(/** @type {HTMLElement} */ (element));
}

/**
 * Recursive function that traverses the children of the target node and finds
 * elements that can receive focus. Mutates the nodes property for performance.
 *
 * @param {Element} element
 * @param {HTMLElement[]} nodes
 * @returns {boolean} whether the returned node list should be sorted. This happens when
 *                    there is an element with tabindex > 0
 */
function collectFocusableElements(element, nodes) {
  // If not an element or not visible, no need to explore children.
  if (!isVisibleElement(element)) {
    return false;
  }

  const el = /** @type {HTMLElement} */ (element);
  const tabIndex = getTabindex(el);
  let needsSort = tabIndex > 0;
  if (tabIndex >= 0) {
    nodes.push(el);
  }

  const childNodes = /** @type {Element[]} */ (getChildNodes(el));
  for (let i = 0; i < childNodes.length; i += 1) {
    needsSort = collectFocusableElements(childNodes[i], nodes) || needsSort;
  }
  return needsSort;
}

/**
 * @param {Element} element
 * @returns {HTMLElement[]}
 */
function getFocusableElements(element) {
  /** @type {HTMLElement[]} */
  const nodes = [];

  const needsSort = collectFocusableElements(element, nodes);
  return needsSort ? sortByTabIndex(nodes) : nodes;
}

/**
 * Whether first element contains the second element, also goes through shadow roots
 * @param {HTMLElement|ShadowRoot} el
 * @param {HTMLElement|ShadowRoot} targetEl
 * @returns {boolean}
 */
function deepContains(el, targetEl) {
  let containsTarget = el.contains(targetEl);
  if (containsTarget) {
    return true;
  }

  /** @param {HTMLElement|ShadowRoot} elem */
  function checkChildren(elem) {
    for (let i = 0; i < elem.children.length; i += 1) {
      const child = /** @type {HTMLElement}  */ (elem.children[i]);
      if (child.shadowRoot && deepContains(child.shadowRoot, targetEl)) {
        containsTarget = true;
        break;
      }
      if (child.children.length > 0) {
        checkChildren(child);
      }
    }
  }

  // If element is not shadowRoot itself
  if (el instanceof HTMLElement && el.shadowRoot) {
    containsTarget = deepContains(el.shadowRoot, targetEl);
    if (containsTarget) {
      return true;
    }
  }
  checkChildren(el);
  return containsTarget;
}

const keyCodes = {
  enter: 13,
  space: 32,
  escape: 27,
  tab: 9,
};

/* eslint-disable no-param-reassign */

/**
 * Rotates focus within a list of elements. If shift key was not pressed and focus
 * is on last item, puts focus on the first item. Reversed if shift key.
 *
 * @param {HTMLElement} rootElement The root element
 * @param {KeyboardEvent} e The keyboard event
 */
function rotateFocus(rootElement, e) {
  // Find focusable elements
  const els = getFocusableElements(rootElement);
  // Determine the focus rotation boundaries.
  let boundaryEls;

  // If more than two elements, take the first and last
  if (els.length >= 2) {
    boundaryEls = [els[0], els[els.length - 1]];

    // If 1 element, it is the boundary
  } else if (els.length === 1) {
    boundaryEls = [els[0], els[0]];

    // If no focusable elements, root becomes the boundary
  } else {
    boundaryEls = [rootElement, rootElement];
  }

  // Reverse direction of boundaries if shift key was pressed
  if (e.shiftKey) {
    boundaryEls.reverse();
  }

  // Take first and last elements within boundary
  const [first, last] = boundaryEls;

  // Get the currently focused element
  const activeElement = /** @type {HTMLElement} */ (getDeepActiveElement());

  /**
   * If currently focused on the root element or an element contained within the root element:
   * allow native browser behavior (tab to the next node in DOM order).
   *
   * If currently focused on the last focusable element within the root element, or on an element
   * outside of the root element: redirect focus to the first focusable element.
   */
  if (activeElement === rootElement || (els.includes(activeElement) && last !== activeElement)) {
    return;
  }

  e.preventDefault();
  first.focus();
}

/**
 * Contains focus within given root element. When focus is on the last focusable
 * element inside the root element, the next focus will be redirected to the first
 * focusable element.
 *
 * @param {HTMLElement} rootElement The element to contain focus within
 * @returns {{ disconnect: () => void }} handler with a disconnect callback
 */
function containFocus(rootElement) {
  const focusableElements = getFocusableElements(rootElement);
  // Initial focus goes to first element with autofocus, or the root element
  const initialFocus = focusableElements.find(e => e.hasAttribute('autofocus')) || rootElement;
  /** @type {HTMLElement} */
  let tabDetectionElement;
  /** @type {MutationObserver} */
  let rootElementMutationObserver;

  // If root element will receive focus, it should have a tabindex of -1.
  // This makes it focusable through js, but it won't appear in the tab order
  if (initialFocus === rootElement) {
    rootElement.tabIndex = -1;
    rootElement.style.setProperty('outline', 'none');
  }

  // Focus first focusable element
  initialFocus.focus();

  /**
   * Ensures focus stays inside root element on tab
   * @param {KeyboardEvent} e
   */
  function handleKeydown(e) {
    if (e.keyCode === keyCodes.tab) {
      rotateFocus(rootElement, e);
    }
  }

  function createHelpersDetectingTabDirection() {
    tabDetectionElement = document.createElement('div');
    tabDetectionElement.style.display = 'none';
    tabDetectionElement.setAttribute('data-is-tab-detection-element', '');
    rootElement.insertBefore(tabDetectionElement, rootElement.children[0]);

    rootElementMutationObserver = new MutationObserver(mutationsList => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          const tabDetectionElIsMissing = !Array.from(rootElement.children).find(el =>
            el.hasAttribute('data-is-tab-detection-element'),
          );
          const foundTabDetectionElInMutations = Array.from(mutation.addedNodes).find(
            /** @param {Node} el */ el =>
              el instanceof HTMLElement && el.hasAttribute('data-is-tab-detection-element'),
          );
          // Prevent infinite loop by detecting that mutation event is not from adding the tab detection el
          if (tabDetectionElIsMissing && !foundTabDetectionElInMutations) {
            rootElementMutationObserver.disconnect();
            createHelpersDetectingTabDirection();
          }
        }
      }
    });
    rootElementMutationObserver.observe(rootElement, { childList: true });
  }

  function isForwardTabInWindow() {
    const compareMask = tabDetectionElement.compareDocumentPosition(
      /** @type {Element} */ (document.activeElement),
    );
    return compareMask === Node.DOCUMENT_POSITION_PRECEDING;
  }

  /**
   * @param {Object} [opts]
   * @param {boolean} [opts.resetToRoot]
   * @desc When we simulate a modal dialog, we need to restore the focus to the first or last
   * element of the rootElement
   */
  function setFocusInRootElement({ resetToRoot = false } = {}) {
    if (deepContains(rootElement, /** @type {HTMLElement} */ (getDeepActiveElement()))) {
      return;
    }

    let nextActive;
    if (resetToRoot) {
      nextActive = rootElement;
    } else {
      nextActive = focusableElements[isForwardTabInWindow() ? 0 : focusableElements.length - 1];
    }

    if (nextActive) {
      nextActive.focus();
    }
  }

  function handleFocusin() {
    window.removeEventListener('focusin', handleFocusin);
    setFocusInRootElement();
  }

  function handleFocusout() {
    /**
     * There is a moment in time between focusout and focusin (when focus shifts)
     * where the activeElement is reset to body first. So we use an async task to check
     * a little bit later for activeElement, so we don't get a false positive.
     *
     * We used to check for focusin event for this, however,
     * it can happen that focusout happens, but focusin never does, e.g. click outside but no focusable
     * element is found to focus. If this happens, we should take the focus back to the rootElement.
     */
    setTimeout(() => {
      if (!deepContains(rootElement, /** @type {HTMLElement} */ (getDeepActiveElement()))) {
        setFocusInRootElement({ resetToRoot: true });
      }
    });

    window.addEventListener('focusin', handleFocusin);
  }

  function disconnect() {
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('focusin', handleFocusin);
    window.removeEventListener('focusout', handleFocusout);
    // Guard this, since we also disconnect if we notice a missing tab
    // detection element. We reinsert it, so it's okay to not fail here.
    rootElementMutationObserver.disconnect();
    if (Array.from(rootElement.children).includes(tabDetectionElement)) {
      rootElement.removeChild(tabDetectionElement);
    }
    rootElement.style.removeProperty('outline');
  }

  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('focusout', handleFocusout);
  createHelpersDetectingTabDirection();

  return { disconnect };
}

/**
 * @typedef {import('../types/OverlayConfig').OverlayConfig} OverlayConfig
 * @typedef {import('../types/OverlayConfig').ViewportConfig} ViewportConfig
 * @typedef {import('@popperjs/core/lib/popper').createPopper} Popper
 * @typedef {import('@popperjs/core/lib/popper').Options} PopperOptions
 * @typedef {import('@popperjs/core/lib/enums').Placement} Placement
 * @typedef {{ createPopper: Popper }} PopperModule
 * @typedef {'setup'|'init'|'teardown'|'before-show'|'show'|'hide'|'add'|'remove'} OverlayPhase
 */

/**
 * @returns {Promise<PopperModule>}
 */
async function preloadPopper() {
  // @ts-ignore import complains about untyped module, but we typecast it ourselves
  return /** @type {Promise<PopperModule>} */ (import('./popper-1adb2df1.js'));
}

const GLOBAL_OVERLAYS_CONTAINER_CLASS = 'global-overlays__overlay-container';
const GLOBAL_OVERLAYS_CLASS = 'global-overlays__overlay';
// @ts-expect-error CSS not yet typed
const supportsCSSTypedObject = window.CSS && CSS.number;

/**
 * @desc OverlayController is the fundament for every single type of overlay. With the right
 * configuration, it can be used to build (modal) dialogs, tooltips, dropdowns, popovers,
 * bottom/top/left/right sheets etc.
 *
 * ### About contentNode, contentWrapperNode and renderTarget.
 *
 * #### contentNode
 * Node containing actual overlay contents.
 * It will not be touched by the OverlayController, it will only set attributes needed
 * for accessibility.
 *
 * #### contentWrapperNode
 * The 'positioning' element.
 * For local overlays, this node will be provided to Popper and all
 * inline positioning styles will be added here. It will also act as the container of an arrow
 * element (the arrow needs to be a sibling of contentNode for Popper to work correctly).
 * When projecting a contentNode from a shadowRoot, it is essential to have the wrapper in
 * shadow dom, so that contentNode can be styled via `::slotted` from the shadow root.
 * The Popper arrow can then be styled from that same shadow root as well.
 * For global overlays, the contentWrapperNode will be appended to the globalRootNode structure.
 *
 * #### renderTarget
 * Usually the parent node of contentWrapperNode that either exists locally or globally.
 * When a responsive scenario is created (in which we switch from global to local or vice versa)
 * we need to know where we should reappend contentWrapperNode (or contentNode in case it's projected)
 *
 * So a regular flow can be summarized as follows:
 * 1. Application Developer spawns an OverlayController with a contentNode reference
 * 2. OverlayController will create a contentWrapperNode around contentNode (or consumes when provided)
 * 3. contentWrapperNode will be appended to the right renderTarget
 *
 * There are subtle differences depending on the following factors:
 * - whether in global/local placement mode
 * - whether contentNode projected
 * - whether an arrow is provided
 *
 * This leads to the following possible combinations:
 * - [l1]. local + no content projection + no arrow
 * - [l2]. local +    content projection + no arrow
 * - [l3]. local + no content projection +    arrow
 * - [l4]. local +    content projection +    arrow
 * - [g1]. global
 *
 * #### html structure for a content projected node
 * <div id="contentWrapperNode">
 *  <slot name="contentNode"></slot>
 *  <div x-arrow></div>
 * </div>
 *
 * Structure above depicts [l4]
 * So in case of [l1] and [l3], the <slot> element would be a regular element
 * In case of [l1] and [l2], there would be no arrow.
 * Note that a contentWrapperNode should be provided for [l2], [l3] and [l4]
 * In case of a global overlay ([g1]), it's enough to provide just the contentNode.
 * In case of a local overlay or a responsive overlay switching from placementMode, one should
 * always configure as if it were a local overlay.
 */
class OverlayController extends EventTargetShim {
  /**
   * @constructor
   * @param {OverlayConfig} config initial config. Will be remembered as shared config
   * when `.updateConfig()` is called.
   */
  constructor(config = {}, manager = overlays) {
    super();
    this.manager = manager;
    this.__sharedConfig = config;

    /** @type {OverlayConfig} */
    this._defaultConfig = {
      placementMode: undefined,
      contentNode: config.contentNode,
      contentWrapperNode: config.contentWrapperNode,
      invokerNode: config.invokerNode,
      backdropNode: config.backdropNode,
      referenceNode: undefined,
      elementToFocusAfterHide: config.invokerNode,
      inheritsReferenceWidth: 'none',
      hasBackdrop: false,
      isBlocking: false,
      preventsScroll: false,
      trapsKeyboardFocus: false,
      hidesOnEsc: false,
      hidesOnOutsideEsc: false,
      hidesOnOutsideClick: false,
      isTooltip: false,
      invokerRelation: 'description',
      // handlesUserInteraction: false,
      handlesAccessibility: false,
      popperConfig: {
        placement: 'top',
        strategy: 'absolute',
        modifiers: [
          {
            name: 'preventOverflow',
            enabled: true,
            options: {
              boundariesElement: 'viewport',
              padding: 8, // viewport-margin for shifting/sliding
            },
          },
          {
            name: 'flip',
            options: {
              boundariesElement: 'viewport',
              padding: 16, // viewport-margin for flipping
            },
          },
          {
            name: 'offset',
            enabled: true,
            options: {
              offset: [0, 8], // horizontal and vertical margin (distance between popper and referenceElement)
            },
          },
          {
            name: 'arrow',
            enabled: false,
          },
        ],
      },
      viewportConfig: {
        placement: 'center',
      },
    };

    this.manager.add(this);
    this._contentId = `overlay-content--${Math.random().toString(36).substr(2, 10)}`;
    this.__originalAttrs = new Map();
    if (this._defaultConfig.contentNode) {
      if (!this._defaultConfig.contentNode.isConnected) {
        throw new Error(
          '[OverlayController] Could not find a render target, since the provided contentNode is not connected to the DOM. Make sure that it is connected, e.g. by doing "document.body.appendChild(contentNode)", before passing it on.',
        );
      }
      this.__isContentNodeProjected = Boolean(this._defaultConfig.contentNode.assignedSlot);
    }
    this.updateConfig(config);
    this.__hasActiveTrapsKeyboardFocus = false;
    this.__hasActiveBackdrop = true;
    /** @type {HTMLElement | undefined} */
    this.__backdropNodeToBeTornDown = undefined;

    this.__escKeyHandler = this.__escKeyHandler.bind(this);
  }

  /**
   * The invokerNode
   * @type {HTMLElement | undefined}
   */
  get invoker() {
    return this.invokerNode;
  }

  /**
   * The contentWrapperNode
   * @type {HTMLElement}
   */
  get content() {
    return /** @type {HTMLElement} */ (this.contentWrapperNode);
  }

  /**
   * Determines the connection point in DOM (body vs next to invoker).
   * @type {'global' | 'local' | undefined}
   */
  get placementMode() {
    return this.config?.placementMode;
  }

  /**
   * The interactive element (usually a button) invoking the dialog or tooltip
   * @type {HTMLElement | undefined}
   */
  get invokerNode() {
    return this.config?.invokerNode;
  }

  /**
   * The element that is used to position the overlay content relative to. Usually,
   * this is the same element as invokerNode. Should only be provided when invokerNode should not
   * be positioned against.
   * @type {HTMLElement}
   */
  get referenceNode() {
    return /** @type {HTMLElement} */ (this.config?.referenceNode);
  }

  /**
   * The most important element: the overlay itself
   * @type {HTMLElement}
   */
  get contentNode() {
    return /** @type {HTMLElement} */ (this.config?.contentNode);
  }

  /**
   * The wrapper element of contentNode, used to supply inline positioning styles. When a Popper
   * arrow is needed, it acts as parent of the arrow node. Will be automatically created for global
   * and non projected contentNodes. Required when used in shadow dom mode or when Popper arrow is
   * supplied. Essential for allowing webcomponents to style their projected contentNodes
   * @type {HTMLElement}
   */
  get contentWrapperNode() {
    return /** @type {HTMLElement} */ (this.__contentWrapperNode ||
      this.config?.contentWrapperNode);
  }

  /**
   * The element that is placed behind the contentNode. When not provided and `hasBackdrop` is true,
   * a backdropNode will be automatically created
   * @type {HTMLElement}
   */
  get backdropNode() {
    return /** @type {HTMLElement} */ (this.__backdropNode || this.config?.backdropNode);
  }

  /**
   * The element that should be called `.focus()` on after dialog closes
   * @type {HTMLElement}
   */
  get elementToFocusAfterHide() {
    return /** @type {HTMLElement} */ (this.__elementToFocusAfterHide ||
      this.config?.elementToFocusAfterHide);
  }

  /**
   * Whether it should have a backdrop (currently exclusive to globalOverlayController)
   * @type {boolean}
   */
  get hasBackdrop() {
    return /** @type {boolean} */ (!!this.backdropNode || this.config?.hasBackdrop);
  }

  /**
   * Hides other overlays when mutiple are opened (currently exclusive to globalOverlayController)
   * @type {boolean}
   */
  get isBlocking() {
    return /** @type {boolean} */ (this.config?.isBlocking);
  }

  /**
   * Hides other overlays when mutiple are opened (currently exclusive to globalOverlayController)
   * @type {boolean}
   */
  get preventsScroll() {
    return /** @type {boolean} */ (this.config?.preventsScroll);
  }

  /**
   * Rotates tab, implicitly set when 'isModal'
   * @type {boolean}
   */
  get trapsKeyboardFocus() {
    return /** @type {boolean} */ (this.config?.trapsKeyboardFocus);
  }

  /**
   * Hides the overlay when pressing [ esc ]
   * @type {boolean}
   */
  get hidesOnEsc() {
    return /** @type {boolean} */ (this.config?.hidesOnEsc);
  }

  /**
   * Hides the overlay when clicking next to it, exluding invoker
   * @type {boolean}
   */
  get hidesOnOutsideClick() {
    return /** @type {boolean} */ (this.config?.hidesOnOutsideClick);
  }

  /**
   * Hides the overlay when pressing esc, even when contentNode has no focus
   * @type {boolean}
   */
  get hidesOnOutsideEsc() {
    return /** @type {boolean} */ (this.config?.hidesOnOutsideEsc);
  }

  /**
   * Will align contentNode with referenceNode (invokerNode by default) for local overlays.
   * Usually needed for dropdowns. 'max' will prevent contentNode from exceeding width of
   * referenceNode, 'min' guarantees that contentNode will be at least as wide as referenceNode.
   * 'full' will make sure that the invoker width always is the same.
   * @type {'max' | 'full' | 'min' | 'none' | undefined }
   */
  get inheritsReferenceWidth() {
    return this.config?.inheritsReferenceWidth;
  }

  /**
   * For non `isTooltip`:
   *  - sets aria-expanded="true/false" and aria-haspopup="true" on invokerNode
   *  - sets aria-controls on invokerNode
   *  - returns focus to invokerNode on hide
   *  - sets focus to overlay content(?)
   *
   * For `isTooltip`:
   *  - sets role="tooltip" and aria-labelledby/aria-describedby on the content
   *
   * @type {boolean}
   */
  get handlesAccessibility() {
    return /** @type {boolean} */ (this.config?.handlesAccessibility);
  }

  /**
   * Has a totally different interaction- and accessibility pattern from all other overlays.
   * Will behave as role="tooltip" element instead of a role="dialog" element
   * @type {boolean}
   */
  get isTooltip() {
    return /** @type {boolean} */ (this.config?.isTooltip);
  }

  /**
   * By default, the tooltip content is a 'description' for the invoker (uses aria-describedby).
   * Setting this property to 'label' makes the content function as a label (via aria-labelledby)
   * @type {'label' | 'description'| undefined}
   */
  get invokerRelation() {
    return this.config?.invokerRelation;
  }

  /**
   * Popper configuration. Will be used when placementMode is 'local'
   * @type {PopperOptions}
   */
  get popperConfig() {
    return /** @type {PopperOptions} */ (this.config?.popperConfig);
  }

  /**
   * Viewport configuration. Will be used when placementMode is 'global'
   * @type {ViewportConfig}
   */
  get viewportConfig() {
    return /** @type {ViewportConfig} */ (this.config?.viewportConfig);
  }

  /**
   * Usually the parent node of contentWrapperNode that either exists locally or globally.
   * When a responsive scenario is created (in which we switch from global to local or vice versa)
   * we need to know where we should reappend contentWrapperNode (or contentNode in case it's
   * projected).
   * @type {HTMLElement}
   */
  get _renderTarget() {
    /** config [g1] */
    if (this.placementMode === 'global') {
      return this.manager.globalRootNode;
    }
    /** config [l2] or [l4] */
    if (this.__isContentNodeProjected) {
      // @ts-expect-error
      return this.__originalContentParent?.getRootNode().host;
    }
    /** config [l1] or [l3] */
    return /** @type {HTMLElement} */ (this.__originalContentParent);
  }

  /**
   * @desc The element our local overlay will be positioned relative to.
   * @type {HTMLElement | undefined}
   */
  get _referenceNode() {
    return this.referenceNode || this.invokerNode;
  }

  /**
   * @param {string} value
   */
  set elevation(value) {
    if (this.contentWrapperNode) {
      this.contentWrapperNode.style.zIndex = value;
    }
    if (this.backdropNode) {
      this.backdropNode.style.zIndex = value;
    }
  }

  /**
   * @type {number}
   */
  get elevation() {
    return Number(this.contentWrapperNode?.style.zIndex);
  }

  /**
   * Allows to dynamically change the overlay configuration. Needed in case the
   * presentation of the overlay changes depending on screen size.
   * Note that this method is the only allowed way to update a configuration of an
   * OverlayController instance.
   * @param { OverlayConfig } cfgToAdd
   */
  updateConfig(cfgToAdd) {
    // Teardown all previous configs
    this.teardown();

    /** @type {OverlayConfig} */
    this.__prevConfig = this.config || {};

    /** @type {OverlayConfig} */
    this.config = {
      ...this._defaultConfig, // our basic ingredients
      ...this.__sharedConfig, // the initial configured overlayController
      ...cfgToAdd, // the added config
      popperConfig: {
        ...(this._defaultConfig.popperConfig || {}),
        ...(this.__sharedConfig.popperConfig || {}),
        ...(cfgToAdd.popperConfig || {}),
        modifiers: [
          ...((this._defaultConfig.popperConfig && this._defaultConfig.popperConfig.modifiers) ||
            []),
          ...((this.__sharedConfig.popperConfig && this.__sharedConfig.popperConfig.modifiers) ||
            []),
          ...((cfgToAdd.popperConfig && cfgToAdd.popperConfig.modifiers) || []),
        ],
      },
    };

    this.__validateConfiguration(/** @type {OverlayConfig} */ (this.config));
    // TODO: remove this, so we only have the getters (no setters)
    // Object.assign(this, this.config);
    this._init({ cfgToAdd });
    this.__elementToFocusAfterHide = undefined;
  }

  /**
   * @param {OverlayConfig} newConfig
   */
  // eslint-disable-next-line class-methods-use-this
  __validateConfiguration(newConfig) {
    if (!newConfig.placementMode) {
      throw new Error(
        '[OverlayController] You need to provide a .placementMode ("global"|"local")',
      );
    }
    if (!['global', 'local'].includes(newConfig.placementMode)) {
      throw new Error(
        `[OverlayController] "${newConfig.placementMode}" is not a valid .placementMode, use ("global"|"local")`,
      );
    }
    if (!newConfig.contentNode) {
      throw new Error('[OverlayController] You need to provide a .contentNode');
    }
    if (this.__isContentNodeProjected && !newConfig.contentWrapperNode) {
      throw new Error(
        '[OverlayController] You need to provide a .contentWrapperNode when .contentNode is projected',
      );
    }
    if (newConfig.isTooltip && newConfig.placementMode !== 'local') {
      throw new Error(
        '[OverlayController] .isTooltip should be configured with .placementMode "local"',
      );
    }
    if (newConfig.isTooltip && !newConfig.handlesAccessibility) {
      throw new Error(
        '[OverlayController] .isTooltip only takes effect when .handlesAccessibility is enabled',
      );
    }
    // if (newConfig.popperConfig.modifiers.arrow && !newConfig.contentWrapperNode) {
    //   throw new Error('You need to provide a .contentWrapperNode when Popper arrow is enabled');
    // }
  }

  /**
   * @param {{ cfgToAdd: OverlayConfig }} options
   */
  _init({ cfgToAdd }) {
    this.__initContentWrapperNode({ cfgToAdd });
    this.__initConnectionTarget();

    if (this.placementMode === 'local') {
      // Lazily load Popper if not done yet
      if (!OverlayController.popperModule) {
        // @ts-expect-error FIXME: for some reason createPopper is missing here
        OverlayController.popperModule = preloadPopper();
      }
    }
    this._handleFeatures({ phase: 'init' });
  }

  __initConnectionTarget() {
    // Now, add our node to the right place in dom (renderTarget)
    if (this.contentWrapperNode !== this.__prevConfig?.contentWrapperNode) {
      if (this.config?.placementMode === 'global' || !this.__isContentNodeProjected) {
        /** @type {HTMLElement} */
        (this.contentWrapperNode).appendChild(this.contentNode);
      }
    }

    if (!this._renderTarget) {
      return;
    }

    if (this.__isContentNodeProjected && this.placementMode === 'local') {
      // We add the contentNode in its slot, so that it will be projected by contentWrapperNode
      this._renderTarget.appendChild(this.contentNode);
    } else {
      const isInsideRenderTarget = this._renderTarget === this.contentWrapperNode.parentNode;
      const nodeContainsTarget = this.contentWrapperNode.contains(this._renderTarget);
      if (!isInsideRenderTarget && !nodeContainsTarget) {
        // contentWrapperNode becomes the direct (non projected) parent of contentNode
        this._renderTarget.appendChild(this.contentWrapperNode);
      }
    }
  }

  /**
   * Cleanup ._contentWrapperNode. We do this, because creating a fresh wrapper
   * can lead to problems with event listeners...
   * @param {{ cfgToAdd: OverlayConfig }} options
   */
  __initContentWrapperNode({ cfgToAdd }) {
    if (this.config?.contentWrapperNode && this.placementMode === 'local') {
      /** config [l2],[l3],[l4] */
      this.__contentWrapperNode = this.config.contentWrapperNode;
    } else {
      /** config [l1],[g1] */
      this.__contentWrapperNode = document.createElement('div');
    }

    this.contentWrapperNode.style.cssText = '';
    this.contentWrapperNode.style.display = 'none';

    if (getComputedStyle(this.contentNode).position === 'absolute') {
      // Having a _contWrapperNode and a contentNode with 'position:absolute' results in
      // computed height of 0...
      this.contentNode.style.position = 'static';
    }

    if (this.__isContentNodeProjected && this.contentWrapperNode.isConnected) {
      // We need to keep track of the original local context.
      /** config [l2], [l4] */
      this.__originalContentParent = /** @type {HTMLElement} */ (this.contentWrapperNode
        .parentNode);
    } else if (cfgToAdd.contentNode && cfgToAdd.contentNode.isConnected) {
      // We need to keep track of the original local context.
      /** config [l1], [l3], [g1] */
      this.__originalContentParent = /** @type {HTMLElement} */ (this.contentNode?.parentNode);
    }
  }

  /**
   * Display local overlays on top of elements with no z-index that appear later in the DOM
   * @param {{ phase: OverlayPhase }} config
   */
  _handleZIndex({ phase }) {
    if (this.placementMode !== 'local') {
      return;
    }

    if (phase === 'setup') {
      const zIndexNumber = Number(getComputedStyle(this.contentNode).zIndex);
      if (zIndexNumber < 1 || Number.isNaN(zIndexNumber)) {
        this.contentWrapperNode.style.zIndex = '1';
      }
    }
  }

  /**
   * @param {{ phase: OverlayPhase }} config
   */
  __setupTeardownAccessibility({ phase }) {
    if (phase === 'init') {
      this.__storeOriginalAttrs(this.contentNode, ['role', 'id']);

      if (this.invokerNode) {
        this.__storeOriginalAttrs(this.invokerNode, [
          'aria-expanded',
          'aria-labelledby',
          'aria-describedby',
        ]);
      }

      if (!this.contentNode.id) {
        this.contentNode.setAttribute('id', this._contentId);
      }
      if (this.isTooltip) {
        if (this.invokerNode) {
          this.invokerNode.setAttribute(
            this.invokerRelation === 'label' ? 'aria-labelledby' : 'aria-describedby',
            this._contentId,
          );
        }
        this.contentNode.setAttribute('role', 'tooltip');
      } else {
        if (this.invokerNode) {
          this.invokerNode.setAttribute('aria-expanded', `${this.isShown}`);
        }
        if (!this.contentNode.getAttribute('role')) {
          this.contentNode.setAttribute('role', 'dialog');
        }
      }
    } else if (phase === 'teardown') {
      this.__restoreOriginalAttrs();
    }
  }

  /**
   * @param {HTMLElement} node
   * @param {string[]} attrs
   */
  __storeOriginalAttrs(node, attrs) {
    const attrMap = {};
    attrs.forEach(attrName => {
      attrMap[attrName] = node.getAttribute(attrName);
    });
    this.__originalAttrs.set(node, attrMap);
  }

  __restoreOriginalAttrs() {
    for (const [node, attrMap] of this.__originalAttrs) {
      Object.entries(attrMap).forEach(([attrName, value]) => {
        if (value !== null) {
          node.setAttribute(attrName, value);
        } else {
          node.removeAttribute(attrName);
        }
      });
    }
    this.__originalAttrs.clear();
  }

  get isShown() {
    return Boolean(this.contentWrapperNode.style.display !== 'none');
  }

  /**
   * @event before-show right before the overlay shows. Used for animations and switching overlays
   * @event show right after the overlay is shown
   * @param {HTMLElement} elementToFocusAfterHide
   */
  async show(elementToFocusAfterHide = this.elementToFocusAfterHide) {
    // Subsequent shows could happen, make sure we await it first.
    // Otherwise it gets replaced before getting resolved, and places awaiting it will time out.
    if (this._showComplete) {
      await this._showComplete;
    }
    this._showComplete = new Promise(resolve => {
      this._showResolve = resolve;
    });

    if (this.manager) {
      this.manager.show(this);
    }

    if (this.isShown) {
      /** @type {function} */
      (this._showResolve)();
      return;
    }

    const event = new CustomEvent('before-show', { cancelable: true });
    this.dispatchEvent(event);
    if (!event.defaultPrevented) {
      this.contentWrapperNode.style.display = '';
      this._keepBodySize({ phase: 'before-show' });
      await this._handleFeatures({ phase: 'show' });
      this._keepBodySize({ phase: 'show' });
      await this._handlePosition({ phase: 'show' });
      this.__elementToFocusAfterHide = elementToFocusAfterHide;
      this.dispatchEvent(new Event('show'));
      await this._transitionShow({
        backdropNode: this.backdropNode,
        contentNode: this.contentNode,
      });
    }
    /** @type {function} */
    (this._showResolve)();
  }

  /**
   * @param {{ phase: OverlayPhase }} config
   */
  async _handlePosition({ phase }) {
    if (this.placementMode === 'global') {
      const addOrRemove = phase === 'show' ? 'add' : 'remove';
      const placementClass = `${GLOBAL_OVERLAYS_CONTAINER_CLASS}--${this.viewportConfig.placement}`;
      this.contentWrapperNode.classList[addOrRemove](GLOBAL_OVERLAYS_CONTAINER_CLASS);
      this.contentWrapperNode.classList[addOrRemove](placementClass);
      this.contentNode.classList[addOrRemove](GLOBAL_OVERLAYS_CLASS);
    } else if (this.placementMode === 'local' && phase === 'show') {
      /**
       * Popper is weird about properly positioning the popper element when it is recreated so
       * we just recreate the popper instance to make it behave like it should.
       * Probably related to this issue: https://github.com/FezVrasta/popper.js/issues/796
       * calling just the .update() function on the popper instance sadly does not resolve this.
       * This is however necessary for initial placement.
       */
      await this.__createPopperInstance();
      /** @type {Popper} */ (this._popper).forceUpdate();
    }
  }

  /**
   * @param {{ phase: OverlayPhase }} config
   */
  _keepBodySize({ phase }) {
    switch (phase) {
      case 'before-show':
        this.__bodyClientWidth = document.body.clientWidth;
        this.__bodyClientHeight = document.body.clientHeight;
        this.__bodyMarginRightInline = document.body.style.marginRight;
        this.__bodyMarginBottomInline = document.body.style.marginBottom;
        break;
      case 'show': {
        if (window.getComputedStyle) {
          const bodyStyle = window.getComputedStyle(document.body);
          this.__bodyMarginRight = parseInt(bodyStyle.getPropertyValue('margin-right'), 10);
          this.__bodyMarginBottom = parseInt(bodyStyle.getPropertyValue('margin-bottom'), 10);
        } else {
          this.__bodyMarginRight = 0;
          this.__bodyMarginBottom = 0;
        }
        const scrollbarWidth =
          document.body.clientWidth - /** @type {number} */ (this.__bodyClientWidth);
        const scrollbarHeight =
          document.body.clientHeight - /** @type {number} */ (this.__bodyClientHeight);
        const newMarginRight = this.__bodyMarginRight + scrollbarWidth;
        const newMarginBottom = this.__bodyMarginBottom + scrollbarHeight;
        if (supportsCSSTypedObject) {
          // @ts-expect-error types attributeStyleMap + CSS.px not available yet
          document.body.attributeStyleMap.set('margin-right', CSS.px(newMarginRight));
          // @ts-expect-error types attributeStyleMap + CSS.px not available yet
          document.body.attributeStyleMap.set('margin-bottom', CSS.px(newMarginBottom));
        } else {
          document.body.style.marginRight = `${newMarginRight}px`;
          document.body.style.marginBottom = `${newMarginBottom}px`;
        }
        break;
      }
      case 'hide':
        document.body.style.marginRight = this.__bodyMarginRightInline || '';
        document.body.style.marginBottom = this.__bodyMarginBottomInline || '';
        break;
      /* no default */
    }
  }

  /**
   * @event before-hide right before the overlay hides. Used for animations and switching overlays
   * @event hide right after the overlay is hidden
   */
  async hide() {
    this._hideComplete = new Promise(resolve => {
      this._hideResolve = resolve;
    });

    if (this.manager) {
      this.manager.hide(this);
    }

    if (!this.isShown) {
      /** @type {function} */ (this._hideResolve)();
      return;
    }

    const event = new CustomEvent('before-hide', { cancelable: true });
    this.dispatchEvent(event);
    if (!event.defaultPrevented) {
      await this._transitionHide({
        backdropNode: this.backdropNode,
        contentNode: this.contentNode,
      });

      this.contentWrapperNode.style.display = 'none';
      this._handleFeatures({ phase: 'hide' });
      this._keepBodySize({ phase: 'hide' });
      this.dispatchEvent(new Event('hide'));
      this._restoreFocus();
    }
    /** @type {function} */ (this._hideResolve)();
  }

  /**
   * Method to be overriden by subclassers
   *
   * @param {{backdropNode:HTMLElement, contentNode:HTMLElement}} hideConfig
   */
  // eslint-disable-next-line class-methods-use-this, no-empty-function, no-unused-vars
  async transitionHide(hideConfig) {}

  /**
   * @param {{backdropNode:HTMLElement, contentNode:HTMLElement}} hideConfig
   */
  // eslint-disable-next-line class-methods-use-this, no-empty-function, no-unused-vars
  async _transitionHide(hideConfig) {
    // `this.transitionHide` is a hook for our users
    await this.transitionHide({ backdropNode: this.backdropNode, contentNode: this.contentNode });

    if (hideConfig.backdropNode) {
      hideConfig.backdropNode.classList.remove(
        `${this.placementMode}-overlays__backdrop--animation-in`,
      );
      /** @type {() => void} */
      let afterFadeOut = () => {};
      hideConfig.backdropNode.classList.add(
        `${this.placementMode}-overlays__backdrop--animation-out`,
      );
      this.__backdropAnimation = new Promise(resolve => {
        afterFadeOut = () => {
          if (hideConfig.backdropNode) {
            hideConfig.backdropNode.classList.remove(
              `${this.placementMode}-overlays__backdrop--animation-out`,
            );
            hideConfig.backdropNode.classList.remove(
              `${this.placementMode}-overlays__backdrop--visible`,
            );
            hideConfig.backdropNode.removeEventListener('animationend', afterFadeOut);
          }
          resolve(undefined);
        };
      });

      hideConfig.backdropNode.addEventListener('animationend', afterFadeOut);
    }
  }

  /**
   * To be overridden by subclassers
   *
   * @param {{backdropNode:HTMLElement, contentNode:HTMLElement}} showConfig
   */
  // eslint-disable-next-line class-methods-use-this, no-empty-function, no-unused-vars
  async transitionShow(showConfig) {}

  /**
   * @param {{backdropNode:HTMLElement, contentNode:HTMLElement}} showConfig
   */
  // eslint-disable-next-line class-methods-use-this, no-empty-function, no-unused-vars
  async _transitionShow(showConfig) {
    // `this.transitionShow` is a hook for our users
    await this.transitionShow({ backdropNode: this.backdropNode, contentNode: this.contentNode });

    if (showConfig.backdropNode) {
      showConfig.backdropNode.classList.add(
        `${this.placementMode}-overlays__backdrop--animation-in`,
      );
    }
  }

  _restoreFocus() {
    // We only are allowed to move focus if we (still) 'own' it.
    // Otherwise we assume the 'outside world' has, purposefully, taken over
    if (this.elementToFocusAfterHide) {
      this.elementToFocusAfterHide.focus();
    } else if (
      document.activeElement &&
      this.__contentWrapperNode?.contains(document.activeElement)
    ) {
      /** @type {HTMLElement} */ (document.activeElement).blur();
    }
  }

  async toggle() {
    return this.isShown ? this.hide() : this.show();
  }

  /**
   * All features are handled here.
   * @param {{ phase: OverlayPhase }} config
   */
  _handleFeatures({ phase }) {
    this._handleZIndex({ phase });

    if (this.preventsScroll) {
      this._handlePreventsScroll({ phase });
    }
    if (this.isBlocking) {
      this._handleBlocking({ phase });
    }
    if (this.hasBackdrop) {
      this._handleBackdrop({ phase });
    }
    if (this.trapsKeyboardFocus) {
      this._handleTrapsKeyboardFocus({ phase });
    }
    if (this.hidesOnEsc) {
      this._handleHidesOnEsc({ phase });
    }
    if (this.hidesOnOutsideEsc) {
      this._handleHidesOnOutsideEsc({ phase });
    }
    if (this.hidesOnOutsideClick) {
      this._handleHidesOnOutsideClick({ phase });
    }
    if (this.handlesAccessibility) {
      this._handleAccessibility({ phase });
    }
    if (this.inheritsReferenceWidth) {
      this._handleInheritsReferenceWidth();
    }
  }

  /**
   * @param {{ phase: OverlayPhase }} config
   */
  _handlePreventsScroll({ phase }) {
    switch (phase) {
      case 'show':
        this.manager.requestToPreventScroll();
        break;
      case 'hide':
        this.manager.requestToEnableScroll();
        break;
      /* no default */
    }
  }

  /**
   * @param {{ phase: OverlayPhase }} config
   */
  _handleBlocking({ phase }) {
    switch (phase) {
      case 'show':
        this.manager.requestToShowOnly(this);
        break;
      case 'hide':
        this.manager.retractRequestToShowOnly(this);
        break;
      /* no default */
    }
  }

  get hasActiveBackdrop() {
    return this.__hasActiveBackdrop;
  }

  /**
   * Sets up backdrop on the given overlay. If there was a backdrop on another element
   * it is removed. Otherwise this is the first time displaying a backdrop, so a animation-in
   * animation is played.
   * @param {{ animation?: boolean, phase: OverlayPhase }} config
   */
  _handleBackdrop({ phase }) {
    switch (phase) {
      case 'init': {
        if (!this.backdropNode) {
          this.__backdropNode = document.createElement('div');
          /** @type {HTMLElement} */
          (this.backdropNode).slot = 'backdrop';
          /** @type {HTMLElement} */
          (this.backdropNode).classList.add(`${this.placementMode}-overlays__backdrop`);
        }

        let insertionAnchor = /** @type {HTMLElement} */ (this.contentNode.parentNode);
        let insertionBefore = this.contentNode;
        if (this.placementMode === 'global') {
          insertionAnchor = /** @type {HTMLElement} */ (this.contentWrapperNode.parentElement);
          insertionBefore = this.contentWrapperNode;
        }
        insertionAnchor.insertBefore(this.backdropNode, insertionBefore);
        break;
      }
      case 'show':
        this.backdropNode.classList.add(`${this.placementMode}-overlays__backdrop--visible`);
        this.__hasActiveBackdrop = true;
        break;
      case 'hide':
        if (!this.backdropNode) {
          return;
        }
        this.__hasActiveBackdrop = false;
        break;
      case 'teardown':
        if (!this.backdropNode || !this.backdropNode.parentNode) {
          return;
        }
        if (this.__backdropAnimation) {
          this.__backdropNodeToBeTornDown = this.backdropNode;

          this.__backdropAnimation.then(() => {
            if (this.__backdropNodeToBeTornDown && this.__backdropNodeToBeTornDown.parentNode) {
              this.__backdropNodeToBeTornDown.parentNode.removeChild(
                this.__backdropNodeToBeTornDown,
              );
            }
          });
        } else {
          this.backdropNode.parentNode.removeChild(this.backdropNode);
        }
        this.__backdropNode = undefined;
        break;
      /* no default */
    }
  }

  get hasActiveTrapsKeyboardFocus() {
    return this.__hasActiveTrapsKeyboardFocus;
  }

  /**
   * @param {{ phase: OverlayPhase }} config
   */
  _handleTrapsKeyboardFocus({ phase }) {
    if (phase === 'show') {
      this.enableTrapsKeyboardFocus();
    } else if (phase === 'hide' || phase === 'teardown') {
      this.disableTrapsKeyboardFocus();
    }
  }

  enableTrapsKeyboardFocus() {
    if (this.__hasActiveTrapsKeyboardFocus) {
      return;
    }
    if (this.manager) {
      this.manager.disableTrapsKeyboardFocusForAll();
    }
    this._containFocusHandler = containFocus(this.contentNode);
    this.__hasActiveTrapsKeyboardFocus = true;
    if (this.manager) {
      this.manager.informTrapsKeyboardFocusGotEnabled(this.placementMode);
    }
  }

  disableTrapsKeyboardFocus({ findNewTrap = true } = {}) {
    if (!this.__hasActiveTrapsKeyboardFocus) {
      return;
    }
    if (this._containFocusHandler) {
      this._containFocusHandler.disconnect();
      this._containFocusHandler = undefined;
    }
    this.__hasActiveTrapsKeyboardFocus = false;
    if (this.manager) {
      this.manager.informTrapsKeyboardFocusGotDisabled({ disabledCtrl: this, findNewTrap });
    }
  }

  __escKeyHandler(/** @type {KeyboardEvent} */ ev) {
    return ev.key === 'Escape' && this.hide();
  }

  /**
   * @param {{ phase: OverlayPhase }} config
   */
  _handleHidesOnEsc({ phase }) {
    if (phase === 'show') {
      this.contentNode.addEventListener('keyup', this.__escKeyHandler);
      if (this.invokerNode) {
        this.invokerNode.addEventListener('keyup', this.__escKeyHandler);
      }
    } else if (phase === 'hide') {
      this.contentNode.removeEventListener('keyup', this.__escKeyHandler);
      if (this.invokerNode) {
        this.invokerNode.removeEventListener('keyup', this.__escKeyHandler);
      }
    }
  }

  /**
   * @param {{ phase: OverlayPhase }} config
   */
  _handleHidesOnOutsideEsc({ phase }) {
    if (phase === 'show') {
      this.__escKeyHandler = (/** @type {KeyboardEvent} */ ev) =>
        ev.key === 'Escape' && this.hide();
      document.addEventListener('keyup', this.__escKeyHandler);
    } else if (phase === 'hide') {
      document.removeEventListener('keyup', this.__escKeyHandler);
    }
  }

  _handleInheritsReferenceWidth() {
    if (!this._referenceNode || this.placementMode === 'global') {
      return;
    }
    const referenceWidth = `${this._referenceNode.getBoundingClientRect().width}px`;
    switch (this.inheritsReferenceWidth) {
      case 'max':
        this.contentWrapperNode.style.maxWidth = referenceWidth;
        break;
      case 'full':
        this.contentWrapperNode.style.width = referenceWidth;
        break;
      case 'min':
        this.contentWrapperNode.style.minWidth = referenceWidth;
        this.contentWrapperNode.style.width = 'auto';
        break;
      /* no default */
    }
  }

  /**
   * @param {{ phase: OverlayPhase }} config
   */
  _handleHidesOnOutsideClick({ phase }) {
    const addOrRemoveListener = phase === 'show' ? 'addEventListener' : 'removeEventListener';

    if (phase === 'show') {
      let wasClickInside = false;
      let wasIndirectSynchronousClick = false;
      // Handle on capture phase and remember till the next task that there was an inside click
      /** @type {EventListenerOrEventListenerObject} */
      this.__preventCloseOutsideClick = () => {
        if (wasClickInside) {
          // This occurs when a synchronous new click is triggered from a previous click.
          // For instance, when we have a label pointing to an input, the platform triggers
          // a new click on the input. Not taking this click into account, will hide the overlay
          // in `__onCaptureHtmlClick`
          wasIndirectSynchronousClick = true;
        }
        wasClickInside = true;
        setTimeout(() => {
          wasClickInside = false;
          setTimeout(() => {
            wasIndirectSynchronousClick = false;
          });
        });
      };
      // handle on capture phase and schedule the hide if needed
      /** @type {EventListenerOrEventListenerObject} */
      this.__onCaptureHtmlClick = () => {
        setTimeout(() => {
          if (wasClickInside === false && !wasIndirectSynchronousClick) {
            this.hide();
          }
        });
      };
    }

    this.contentWrapperNode[addOrRemoveListener](
      'click',
      /** @type {EventListenerOrEventListenerObject} */
      (this.__preventCloseOutsideClick),
      true,
    );
    if (this.invokerNode) {
      this.invokerNode[addOrRemoveListener](
        'click',
        /** @type {EventListenerOrEventListenerObject} */
        (this.__preventCloseOutsideClick),
        true,
      );
    }
    document.documentElement[addOrRemoveListener](
      'click',
      /** @type {EventListenerOrEventListenerObject} */
      (this.__onCaptureHtmlClick),
      true,
    );
  }

  /**
   * @param {{ phase: OverlayPhase }} config
   */
  _handleAccessibility({ phase }) {
    if (phase === 'init' || phase === 'teardown') {
      this.__setupTeardownAccessibility({ phase });
    }
    if (this.invokerNode && !this.isTooltip) {
      this.invokerNode.setAttribute('aria-expanded', `${phase === 'show'}`);
    }
  }

  teardown() {
    this._handleFeatures({ phase: 'teardown' });

    if (this.placementMode === 'global' && this.__isContentNodeProjected) {
      /** @type {HTMLElement} */ (this.__originalContentParent).appendChild(this.contentNode);
    }

    // Remove the content node wrapper from the global rootnode
    this._teardownContentWrapperNode();
  }

  _teardownContentWrapperNode() {
    if (
      this.placementMode === 'global' &&
      this.contentWrapperNode &&
      this.contentWrapperNode.parentNode
    ) {
      this.contentWrapperNode.parentNode.removeChild(this.contentWrapperNode);
    }
  }

  async __createPopperInstance() {
    if (this._popper) {
      this._popper.destroy();
      this._popper = undefined;
    }

    if (OverlayController.popperModule !== undefined) {
      const { createPopper } = await OverlayController.popperModule;
      this._popper = createPopper(this._referenceNode, this.contentWrapperNode, {
        ...this.config?.popperConfig,
      });
    }
  }
}
/** @type {PopperModule | undefined} */
OverlayController.popperModule = undefined;

/**
 * @typedef {import('../../types/OverlayConfig').OverlayConfig} OverlayConfig
 */

/**
 * Compares two OverlayConfigs to equivalence. Intended to prevent unnecessary resets.
 * Note that it doesn't cover as many use cases as common implementations, such as Lodash isEqual.
 *
 * @param {Partial<OverlayConfig>} a
 * @param {Partial<OverlayConfig>} b
 * @returns {boolean} Whether the configs are equivalent
 */
function isEqualConfig(a, b) {
  if (typeof a !== 'object' || typeof a !== 'object') {
    return a === b;
  }
  const aProps = Object.keys(a);
  const bProps = Object.keys(b);
  if (aProps.length !== bProps.length) {
    return false;
  }
  const isEqual = /** @param {string} prop */ prop => isEqualConfig(a[prop], b[prop]);
  return aProps.every(isEqual);
}

/**
 * @typedef {import('../types/OverlayConfig').OverlayConfig} OverlayConfig
 * @typedef {import('../types/OverlayMixinTypes').DefineOverlayConfig} DefineOverlayConfig
 * @typedef {import('../types/OverlayMixinTypes').OverlayHost} OverlayHost
 * @typedef {import('../types/OverlayMixinTypes').OverlayMixin} OverlayMixin
 */

/**
 * @type {OverlayMixin}
 */
const OverlayMixinImplementation = superclass =>
  class OverlayMixin extends superclass {
    static get properties() {
      return {
        opened: {
          type: Boolean,
          reflect: true,
        },
      };
    }

    constructor() {
      super();
      this.opened = false;
      this.__needsSetup = true;
      /** @type {OverlayConfig} */
      this.config = {};

      /** @type {EventListener} */
      this.toggle = this.toggle.bind(this);
      /** @type {EventListener} */
      this.open = this.open.bind(this);
      /** @type {EventListener} */
      this.close = this.close.bind(this);
    }

    get config() {
      return /** @type {OverlayConfig} */ (this.__config);
    }

    /** @param {OverlayConfig} value */
    set config(value) {
      const shouldUpdate = !isEqualConfig(this.config, value);

      if (this._overlayCtrl && shouldUpdate) {
        this._overlayCtrl.updateConfig(value);
      }
      this.__config = value;
      if (this._overlayCtrl && shouldUpdate) {
        this.__syncToOverlayController();
      }
    }

    /**
     * @override
     * @param {string} name
     * @param {any} oldValue
     */
    requestUpdateInternal(name, oldValue) {
      super.requestUpdateInternal(name, oldValue);
      if (name === 'opened' && this.opened !== oldValue) {
        this.dispatchEvent(new Event('opened-changed'));
      }
    }

    /**
     * @overridable method `_defineOverlay`
     * @desc returns an instance of a (dynamic) overlay controller
     * In case overriding _defineOverlayConfig is not enough
     * @param {DefineOverlayConfig} config
     * @returns {OverlayController}
     */
    // eslint-disable-next-line
    _defineOverlay({ contentNode, invokerNode, referenceNode, backdropNode, contentWrapperNode }) {
      const overlayConfig = this._defineOverlayConfig() || {};

      return new OverlayController({
        contentNode,
        invokerNode,
        referenceNode,
        backdropNode,
        contentWrapperNode,
        ...overlayConfig, // wc provided in the class as defaults
        ...this.config, // user provided (e.g. in template)
        popperConfig: {
          ...(overlayConfig.popperConfig || {}),
          ...(this.config.popperConfig || {}),
          modifiers: [
            ...(overlayConfig.popperConfig?.modifiers || []),
            ...(this.config.popperConfig?.modifiers || []),
          ],
        },
      });
    }

    /**
     * @overridable method `_defineOverlayConfig`
     * @desc returns an object with default configuration options for your overlay component.
     * This is generally speaking easier to override than _defineOverlay method entirely.
     * @returns {OverlayConfig}
     */
    // eslint-disable-next-line
    _defineOverlayConfig() {
      return {
        placementMode: 'local',
      };
    }

    /**
     * @param {import('@lion/core').PropertyValues } changedProperties
     */
    updated(changedProperties) {
      super.updated(changedProperties);

      if (changedProperties.has('opened') && this._overlayCtrl && !this.__blockSyncToOverlayCtrl) {
        this.__syncToOverlayController();
      }
    }

    /**
     * @overridable
     * @desc use this method to setup your open and close event listeners
     * For example, set a click event listener on _overlayInvokerNode to set opened to true
     */
    // eslint-disable-next-line class-methods-use-this
    _setupOpenCloseListeners() {
      /**
       * @param {{ stopPropagation: () => void; }} ev
       */
      this.__closeEventInContentNodeHandler = ev => {
        ev.stopPropagation();
        /** @type {OverlayController} */ (this._overlayCtrl).hide();
      };
      if (this._overlayContentNode) {
        this._overlayContentNode.addEventListener(
          'close-overlay',
          this.__closeEventInContentNodeHandler,
        );
      }
    }

    /**
     * @overridable
     * @desc use this method to tear down your event listeners
     */
    // eslint-disable-next-line class-methods-use-this
    _teardownOpenCloseListeners() {
      if (this._overlayContentNode) {
        this._overlayContentNode.removeEventListener(
          'close-overlay',
          this.__closeEventInContentNodeHandler,
        );
      }
    }

    connectedCallback() {
      super.connectedCallback();
      // we do a setup after every connectedCallback as firstUpdated will only be called once
      this.__needsSetup = true;
      this.updateComplete.then(() => {
        if (this.__needsSetup) {
          this._setupOverlayCtrl();
        }
        this.__needsSetup = false;
      });
    }

    disconnectedCallback() {
      if (super.disconnectedCallback) {
        super.disconnectedCallback();
      }
      if (this._overlayCtrl) {
        this._teardownOverlayCtrl();
      }
    }

    get _overlayInvokerNode() {
      return Array.from(this.children).find(child => child.slot === 'invoker');
    }

    /**
     * @overridable
     */
    // eslint-disable-next-line class-methods-use-this
    get _overlayReferenceNode() {
      return undefined;
    }

    get _overlayBackdropNode() {
      return Array.from(this.children).find(child => child.slot === 'backdrop');
    }

    get _overlayContentNode() {
      if (!this._cachedOverlayContentNode) {
        this._cachedOverlayContentNode =
          Array.from(this.children).find(child => child.slot === 'content') ||
          this.config.contentNode;
      }
      return this._cachedOverlayContentNode;
    }

    get _overlayContentWrapperNode() {
      return this.shadowRoot.querySelector('#overlay-content-node-wrapper');
    }

    _setupOverlayCtrl() {
      /** @type {OverlayController} */
      this._overlayCtrl = this._defineOverlay({
        contentNode: this._overlayContentNode,
        contentWrapperNode: this._overlayContentWrapperNode,
        invokerNode: this._overlayInvokerNode,
        referenceNode: this._overlayReferenceNode,
        backdropNode: this._overlayBackdropNode,
      });
      this.__syncToOverlayController();
      this.__setupSyncFromOverlayController();
      this._setupOpenCloseListeners();
    }

    _teardownOverlayCtrl() {
      this._teardownOpenCloseListeners();
      this.__teardownSyncFromOverlayController();
      /** @type {OverlayController} */
      (this._overlayCtrl).teardown();
    }

    /**
     * When the opened state is changed by an Application Developer,cthe OverlayController is
     * requested to show/hide. It might happen that this request is not honoured
     * (intercepted in before-hide for instance), so that we need to sync the controller state
     * to this webcomponent again, preventing eternal loops.
     * @param {boolean} newOpened
     */
    async _setOpenedWithoutPropertyEffects(newOpened) {
      this.__blockSyncToOverlayCtrl = true;
      this.opened = newOpened;
      await this.updateComplete;
      this.__blockSyncToOverlayCtrl = false;
    }

    __setupSyncFromOverlayController() {
      this.__onOverlayCtrlShow = () => {
        this.opened = true;
      };

      this.__onOverlayCtrlHide = () => {
        this.opened = false;
      };

      /**
       * @param {{ preventDefault: () => void; }} beforeShowEvent
       */
      this.__onBeforeShow = beforeShowEvent => {
        const event = new CustomEvent('before-opened', { cancelable: true });
        this.dispatchEvent(event);
        if (event.defaultPrevented) {
          // Check whether our current `.opened` state is not out of sync with overlayCtrl
          this._setOpenedWithoutPropertyEffects(
            /** @type {OverlayController} */ (this._overlayCtrl).isShown,
          );
          beforeShowEvent.preventDefault();
        }
      };

      /**
       * @param {{ preventDefault: () => void; }} beforeHideEvent
       */
      this.__onBeforeHide = beforeHideEvent => {
        const event = new CustomEvent('before-closed', { cancelable: true });
        this.dispatchEvent(event);
        if (event.defaultPrevented) {
          // Check whether our current `.opened` state is not out of sync with overlayCtrl
          this._setOpenedWithoutPropertyEffects(
            /** @type {OverlayController} */
            (this._overlayCtrl).isShown,
          );
          beforeHideEvent.preventDefault();
        }
      };

      /** @type {OverlayController} */
      (this._overlayCtrl).addEventListener('show', this.__onOverlayCtrlShow);
      /** @type {OverlayController} */
      (this._overlayCtrl).addEventListener('hide', this.__onOverlayCtrlHide);
      /** @type {OverlayController} */
      (this._overlayCtrl).addEventListener('before-show', this.__onBeforeShow);
      /** @type {OverlayController} */
      (this._overlayCtrl).addEventListener('before-hide', this.__onBeforeHide);
    }

    __teardownSyncFromOverlayController() {
      /** @type {OverlayController} */
      (this._overlayCtrl).removeEventListener(
        'show',
        /** @type {EventListener} */ (this.__onOverlayCtrlShow),
      );
      /** @type {OverlayController} */ (this._overlayCtrl).removeEventListener(
        'hide',
        /** @type {EventListener} */ (this.__onOverlayCtrlHide),
      );
      /** @type {OverlayController} */ (this._overlayCtrl).removeEventListener(
        'before-show',
        /** @type {EventListener} */ (this.__onBeforeShow),
      );
      /** @type {OverlayController} */ (this._overlayCtrl).removeEventListener(
        'before-hide',
        /** @type {EventListener} */ (this.__onBeforeHide),
      );
    }

    __syncToOverlayController() {
      if (this.opened) {
        /** @type {OverlayController} */
        (this._overlayCtrl).show();
      } else {
        /** @type {OverlayController} */
        (this._overlayCtrl).hide();
      }
    }

    /**
     * Toggles the overlay
     */
    async toggle() {
      await /** @type {OverlayController} */ (this._overlayCtrl).toggle();
    }

    /**
     * Shows the overlay
     */
    async open() {
      await /** @type {OverlayController} */ (this._overlayCtrl).show();
    }

    /**
     * Hides the overlay
     */
    async close() {
      await /** @type {OverlayController} */ (this._overlayCtrl).hide();
    }
  };
const OverlayMixin = dedupeMixin(OverlayMixinImplementation);

/**
 * @typedef {import('../types/OverlayConfig').OverlayConfig} OverlayConfig
 * @typedef {import('../types/ArrowMixinTypes').ArrowMixin} ArrowMixin
 * @typedef {import('@popperjs/core/lib/popper').Options} PopperOptions
 * @typedef {import('@popperjs/core/lib/enums').Placement} Placement
 */

/**
 * @type {ArrowMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<import('@lion/core').LitElement>} superclass
 */
const ArrowMixinImplementation = superclass =>
  class ArrowMixin extends OverlayMixin(superclass) {
    static get properties() {
      return {
        hasArrow: {
          type: Boolean,
          reflect: true,
          attribute: 'has-arrow',
        },
      };
    }

    static get styles() {
      return [
        super.styles || [],
        css`
          :host {
            --tooltip-arrow-width: 12px;
            --tooltip-arrow-height: 8px;
          }

          .arrow svg {
            display: block;
          }

          .arrow {
            position: absolute;
            width: var(--tooltip-arrow-width);
            height: var(--tooltip-arrow-height);
          }

          .arrow__graphic {
            display: block;
          }

          [data-popper-placement^='top'] .arrow {
            bottom: calc(-1 * var(--tooltip-arrow-height));
          }

          [data-popper-placement^='bottom'] .arrow {
            top: calc(-1 * var(--tooltip-arrow-height));
          }

          [data-popper-placement^='bottom'] .arrow__graphic {
            transform: rotate(180deg);
          }

          [data-popper-placement^='left'] .arrow {
            right: calc(
              -1 * (var(--tooltip-arrow-height) +
                    (var(--tooltip-arrow-width) - var(--tooltip-arrow-height)) / 2)
            );
          }

          [data-popper-placement^='left'] .arrow__graphic {
            transform: rotate(270deg);
          }

          [data-popper-placement^='right'] .arrow {
            left: calc(
              -1 * (var(--tooltip-arrow-height) +
                    (var(--tooltip-arrow-width) - var(--tooltip-arrow-height)) / 2)
            );
          }

          [data-popper-placement^='right'] .arrow__graphic {
            transform: rotate(90deg);
          }

          :host(:not([has-arrow])) .arrow {
            display: none;
          }
        `,
      ];
    }

    constructor() {
      super();
      this.hasArrow = true;
      this.__setupRepositionCompletePromise();
    }

    render() {
      return html`
        <slot name="invoker"></slot>
        <div id="overlay-content-node-wrapper">
          <slot name="content"></slot>
          ${this._arrowNodeTemplate()}
        </div>
      `;
    }

    _arrowNodeTemplate() {
      return html` <div class="arrow" data-popper-arrow>${this._arrowTemplate()}</div> `;
    }

    // eslint-disable-next-line class-methods-use-this
    _arrowTemplate() {
      return html`
        <svg viewBox="0 0 12 8" class="arrow__graphic">
          <path d="M 0,0 h 12 L 6,8 z"></path>
        </svg>
      `;
    }

    /**
     * Overrides arrow and keepTogether modifier to be enabled,
     * and adds onCreate and onUpdate hooks to sync from popper state
     * @configure OverlayMixin
     * @returns {OverlayConfig}
     */
    // eslint-disable-next-line
    _defineOverlayConfig() {
      const superConfig = super._defineOverlayConfig() || {};
      if (!this.hasArrow) {
        return superConfig;
      }
      return {
        ...superConfig,
        popperConfig: {
          ...this._getPopperArrowConfig(
            /** @type {Partial<PopperOptions>} */ (superConfig.popperConfig),
          ),
        },
      };
    }

    /**
     * @param {Partial<PopperOptions>} popperConfigToExtendFrom
     * @returns {Partial<PopperOptions>}
     */
    _getPopperArrowConfig(popperConfigToExtendFrom) {
      /** @type {Partial<PopperOptions> & { afterWrite: (arg0: Partial<import('@popperjs/core/lib/popper').State>) => void }} */
      const popperCfg = {
        ...(popperConfigToExtendFrom || {}),
        placement: /** @type {Placement} */ ('top'),
        modifiers: [
          {
            name: 'arrow',
            enabled: true,
            options: {
              padding: 8, // 8px from the edges of the popper
            },
          },
          {
            name: 'offset',
            enabled: true,
            options: { offset: [0, 8] },
          },
          ...((popperConfigToExtendFrom && popperConfigToExtendFrom.modifiers) || []),
        ],
        /** @param {Partial<import('@popperjs/core/lib/popper').State>} data */
        onFirstUpdate: data => {
          this.__syncFromPopperState(data);
        },
        /** @param {Partial<import('@popperjs/core/lib/popper').State>} data */
        afterWrite: data => {
          this.__syncFromPopperState(data);
        },
      };

      return popperCfg;
    }

    __setupRepositionCompletePromise() {
      this.repositionComplete = new Promise(resolve => {
        this.__repositionCompleteResolver = resolve;
      });
    }

    get _arrowNode() {
      return /** @type {ShadowRoot} */ (this.shadowRoot).querySelector('[data-popper-arrow]');
    }

    /**
     * @param {Partial<import('@popperjs/core/lib/popper').State>} data
     */
    __syncFromPopperState(data) {
      if (!data) {
        return;
      }
      if (
        this._arrowNode &&
        data.placement !== /** @type {Element & {placement:string}} */ (this._arrowNode).placement
      ) {
        /** @type {function} */ (this.__repositionCompleteResolver)(data.placement);
        this.__setupRepositionCompletePromise();
      }
    }
  };

const ArrowMixin = dedupeMixin(ArrowMixinImplementation);

/**
 * @typedef {import('../../types/OverlayConfig').OverlayConfig} OverlayConfig
 */

const withBottomSheetConfig = () =>
  /** @type {OverlayConfig} */ ({
    hasBackdrop: true,
    preventsScroll: true,
    trapsKeyboardFocus: true,
    hidesOnEsc: true,
    placementMode: 'global',
    viewportConfig: {
      placement: 'bottom',
    },
    handlesAccessibility: true,
  });

/**
 * @typedef {import('../../types/OverlayConfig').OverlayConfig} OverlayConfig
 */

const withModalDialogConfig = () =>
  /** @type {OverlayConfig} */ ({
    placementMode: 'global',
    viewportConfig: {
      placement: 'center',
    },
    hasBackdrop: true,
    preventsScroll: true,
    trapsKeyboardFocus: true,
    hidesOnEsc: true,
    handlesAccessibility: true,
  });

class LionCalendarOverlayFrame extends LocalizeMixin(LitElement) {
  static get styles() {
    return [
      css`
        :host {
          display: inline-block;
          background: white;
          position: relative;
        }

        :host([hidden]) {
          display: none;
        }

        .calendar-overlay__header {
          display: flex;
        }

        .calendar-overlay__heading {
          padding: 16px 16px 8px;
          flex: 1;
        }

        .calendar-overlay__heading > .calendar-overlay__close-button {
          flex: none;
        }

        .calendar-overlay__close-button {
          min-width: 40px;
          min-height: 32px;
          border-width: 0;
          padding: 0;
          font-size: 24px;
        }
      `,
    ];
  }

  static get localizeNamespaces() {
    return [
      {
        'lion-calendar-overlay-frame': /** @param {string} locale */ locale => {
          switch (locale) {
            case 'bg-BG':
              return import('./bg-BG-a0af4651.js');
            case 'cs-CZ':
              return import('./cs-CZ-df7edb0d.js');
            case 'de-DE':
              return import('./de-DE-aca6a89e.js');
            case 'en-AU':
              return import('./en-AU-ba16f450.js');
            case 'en-GB':
              return import('./en-GB-272c8468.js');
            case 'en-US':
              return import('./en-US-bed56d83.js');
            case 'en-PH':
              return import('./en-3df32cba.js');
            case 'es-ES':
              return import('./es-ES-8d9bba69.js');
            case 'fr-FR':
              return import('./fr-FR-b658bf11.js');
            case 'fr-BE':
              return import('./fr-BE-24bbd15a.js');
            case 'hu-HU':
              return import('./hu-HU-deba123c.js');
            case 'it-IT':
              return import('./it-IT-ca141d2d.js');
            case 'nl-BE':
              return import('./nl-BE-f5b05bba.js');
            case 'nl-NL':
              return import('./nl-NL-400ef9ae.js');
            case 'pl-PL':
              return import('./pl-PL-57f02996.js');
            case 'ro-RO':
              return import('./ro-RO-48518e62.js');
            case 'ru-RU':
              return import('./ru-RU-685e19fc.js');
            case 'sk-SK':
              return import('./sk-SK-d62c6a15.js');
            case 'uk-UA':
              return import('./uk-UA-8fae1d4c.js');
            case 'zh-CN':
              return import('./zh-c71bdec6.js');
            default:
              return import('./en-3df32cba.js');
          }
        },
      },
      ...super.localizeNamespaces,
    ];
  }

  __dispatchCloseEvent() {
    this.dispatchEvent(new Event('close-overlay'));
  }

  render() {
    // eslint-disable-line class-methods-use-this
    return html`
      <div class="calendar-overlay">
        <div class="calendar-overlay__header">
          <h1 class="calendar-overlay__heading">
            <slot name="heading"></slot>
          </h1>
          <button
            @click="${this.__dispatchCloseEvent}"
            id="close-button"
            title="${this.msgLit('lion-calendar-overlay-frame:close')}"
            aria-label="${this.msgLit('lion-calendar-overlay-frame:close')}"
            class="calendar-overlay__close-button"
          >
            <slot name="close-icon">&times;</slot>
          </button>
        </div>
        <div id="overlay-content-node-wrapper">
          <slot name="content"></slot>
        </div>
      </div>
    `;
  }
}

/**
 * @customElement lion-input-datepicker
 */
class LionInputDatepicker extends ScopedElementsMixin(
  ArrowMixin(OverlayMixin(LionInputDate)),
) {
  static get scopedElements() {
    return {
      ...super.scopedElements,
      'lion-calendar': LionCalendar,
      'lion-calendar-overlay-frame': LionCalendarOverlayFrame,
    };
  }

  /** @type {any} */
  static get properties() {
    return {
      /**
       * The heading to be added on top of the calendar overlay.
       * Naming chosen from an Application Developer perspective.
       * For a Subclasser 'calendarOverlayHeading' would be more appropriate.
       */
      calendarHeading: {
        type: String,
        attribute: 'calendar-heading',
      },
      /**
       * The slot to put the invoker button in. Can be 'prefix', 'suffix', 'before' and 'after'.
       * Default will be 'suffix'.
       */
      _calendarInvokerSlot: {
        attribute: false,
      },

      __calendarMinDate: {
        attribute: false,
      },

      __calendarMaxDate: {
        attribute: false,
      },

      __calendarDisableDates: {
        attribute: false,
      },
    };
  }

  get slots() {
    return {
      ...super.slots,
      [this._calendarInvokerSlot]: () => {
        const renderParent = document.createElement('div');
        /** @type {typeof LionInputDatepicker} */ (this.constructor).render(
          this._invokerTemplate(),
          renderParent,
          {
            scopeName: this.localName,
            eventContext: this,
          },
        );
        return /** @type {HTMLElement} */ (renderParent.firstElementChild);
      },
    };
  }

  static get localizeNamespaces() {
    return [
      {
        'lion-input-datepicker': /** @param {string} locale */ locale => {
          switch (locale) {
            case 'bg-BG':
              return import('./bg-BG-744b79ba.js');
            case 'bg':
              return import('./bg-10ad8fe1.js');
            case 'cs-CZ':
              return import('./cs-CZ-4ceacdd9.js');
            case 'cs':
              return import('./cs-a683093e.js');
            case 'de-DE':
              return import('./de-DE-fe50a073.js');
            case 'de':
              return import('./de-735a109d.js');
            case 'en-AU':
              return import('./en-AU-12aadfef.js');
            case 'en-GB':
              return import('./en-GB-c1f8d432.js');
            case 'en-US':
              return import('./en-US-485bb32b.js');
            case 'en-PH':
            case 'en':
              return import('./en-b79c27f1.js');
            case 'es-ES':
              return import('./es-ES-015306cd.js');
            case 'es':
              return import('./es-79c27179.js');
            case 'fr-FR':
              return import('./fr-FR-cef1fc48.js');
            case 'fr-BE':
              return import('./fr-BE-0b4526a7.js');
            case 'fr':
              return import('./fr-2a7620f1.js');
            case 'hu-HU':
              return import('./hu-HU-fc105ae1.js');
            case 'hu':
              return import('./hu-2a879c51.js');
            case 'it-IT':
              return import('./it-IT-16563373.js');
            case 'it':
              return import('./it-d66fe4ff.js');
            case 'nl-BE':
              return import('./nl-BE-fbb02744.js');
            case 'nl-NL':
              return import('./nl-NL-baae4eeb.js');
            case 'nl':
              return import('./nl-a9a447e9.js');
            case 'pl-PL':
              return import('./pl-PL-c432784d.js');
            case 'pl':
              return import('./pl-f7a9bcd5.js');
            case 'ro-RO':
              return import('./ro-RO-e2ac7c1b.js');
            case 'ro':
              return import('./ro-590644d9.js');
            case 'ru-RU':
              return import('./ru-RU-1f71e1a9.js');
            case 'ru':
              return import('./ru-8f5e08c7.js');
            case 'sk-SK':
              return import('./sk-SK-320b7d98.js');
            case 'sk':
              return import('./sk-73b4674c.js');
            case 'uk-UA':
              return import('./uk-UA-3b3c1ea5.js');
            case 'uk':
              return import('./uk-8347d2b7.js');
            case 'zh-CN':
            case 'zh':
              return import('./zh-67fc607f.js');
            default:
              return import('./en-b79c27f1.js');
          }
        },
      },
      ...super.localizeNamespaces,
    ];
  }

  get _invokerNode() {
    return /** @type {HTMLElement} */ (this.querySelector(`#${this.__invokerId}`));
  }

  get _calendarNode() {
    return /** @type {LionCalendar} */ (this._overlayCtrl.contentNode.querySelector(
      '[slot="content"]',
    ));
  }

  constructor() {
    super();
    this.__invokerId = this.__createUniqueIdForA11y();
    this._calendarInvokerSlot = 'suffix';

    // Configuration flags for subclassers
    this._focusCentralDateOnCalendarOpen = true;
    this._hideOnUserSelect = true;
    this._syncOnUserSelect = true;

    this.__openCalendarOverlay = this.__openCalendarOverlay.bind(this);
    this._onCalendarUserSelectedChanged = this._onCalendarUserSelectedChanged.bind(this);
  }

  __createUniqueIdForA11y() {
    return `${this.localName}-${Math.random().toString(36).substr(2, 10)}`;
  }

  /**
   * @param {PropertyKey} name
   * @param {?} oldValue
   */
  requestUpdateInternal(name, oldValue) {
    super.requestUpdateInternal(name, oldValue);

    if (name === 'disabled' || name === 'readOnly') {
      this.__toggleInvokerDisabled();
    }
  }

  __toggleInvokerDisabled() {
    if (this._invokerNode) {
      const invokerNode = /** @type {HTMLElement & {disabled: boolean}} */ (this._invokerNode);
      invokerNode.disabled = this.disabled || this.readOnly;
    }
  }

  /** @param {import('@lion/core').PropertyValues } changedProperties */
  firstUpdated(changedProperties) {
    super.firstUpdated(changedProperties);
    this.__toggleInvokerDisabled();
  }

  /** @param {import('@lion/core').PropertyValues } changedProperties */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('validators')) {
      const validators = [...(this.validators || [])];
      this.__syncDisabledDates(validators);
    }
    if (changedProperties.has('label')) {
      this.calendarHeading = this.calendarHeading || this.label;
    }
  }

  /**
   * Defining this overlay as a templates from OverlayMixin
   * this is our source to give as .contentNode to OverlayController.
   * Important: do not change the name of this method.
   */
  _overlayTemplate() {
    // TODO: add performance optimization to only render the calendar if needed
    // When not opened (usually on init), it does not need to be rendered.
    // This would make first paint quicker
    return html`
      <div id="overlay-content-node-wrapper">
        <lion-calendar-overlay-frame class="calendar__overlay-frame">
          <span slot="heading">${this.calendarHeading}</span>
          ${this._calendarTemplate()}
        </lion-calendar-overlay-frame>
        ${this._arrowNodeTemplate()}
      </div>
    `;
  }

  render() {
    return html`
      <div class="form-field__group-one">${this._groupOneTemplate()}</div>
      <div class="form-field__group-two">
        ${this._groupTwoTemplate()} ${this._overlayTemplate()}
      </div>
    `;
  }

  /**
   * Subclassers can replace this with their custom extension of
   * LionCalendar, like `<my-calendar id="calendar"></my-calendar>`
   */
  // eslint-disable-next-line class-methods-use-this
  _calendarTemplate() {
    return html`
      <lion-calendar
        slot="content"
        .selectedDate="${
          /** @type {typeof LionInputDatepicker} */ (this.constructor).__getSyncDownValue(
            this.modelValue,
          )
        }"
        .minDate="${this.__calendarMinDate}"
        .maxDate="${this.__calendarMaxDate}"
        .disableDates="${ifDefined(this.__calendarDisableDates)}"
        @user-selected-date-changed="${this._onCalendarUserSelectedChanged}"
      ></lion-calendar>
    `;
  }

  /**
   * Subclassers can replace this with their custom extension invoker,
   * like `<my-button><calendar-icon></calendar-icon></my-button>`
   */
  // eslint-disable-next-line class-methods-use-this
  _invokerTemplate() {
    return html`
      <button
        type="button"
        @click="${this.__openCalendarOverlay}"
        id="${this.__invokerId}"
        aria-label="${this.msgLit('lion-input-datepicker:openDatepickerLabel')}"
        title="${this.msgLit('lion-input-datepicker:openDatepickerLabel')}"
      >
        📅
      </button>
    `;
  }

  _setupOverlayCtrl() {
    super._setupOverlayCtrl();

    this.__datepickerBeforeShow = () => {
      this._overlayCtrl.updateConfig(this._defineOverlayConfig());
    };
    this._overlayCtrl.addEventListener('before-show', this.__datepickerBeforeShow);
  }

  /**
   * @override Configures OverlayMixin
   * @desc overrides default configuration options for this component
   * @returns {Object}
   */
  // eslint-disable-next-line class-methods-use-this
  _defineOverlayConfig() {
    if (window.innerWidth >= 600) {
      this.hasArrow = true;
      return {
        ...withModalDialogConfig(),
        hidesOnOutsideClick: true,
        ...super._defineOverlayConfig(),
        popperConfig: {
          ...super._defineOverlayConfig().popperConfig,
          placement: 'bottom',
        },
      };
    }
    this.hasArrow = false;
    return withBottomSheetConfig();
  }

  async __openCalendarOverlay() {
    await this._overlayCtrl.show();
    await Promise.all([
      /** @type {import('@lion/core').LitElement} */ (this._overlayCtrl.contentNode).updateComplete,
      this._calendarNode.updateComplete,
    ]);
    this._onCalendarOverlayOpened();
  }

  /**
   * Lifecycle callback for subclassers
   */
  _onCalendarOverlayOpened() {
    if (this._focusCentralDateOnCalendarOpen) {
      if (this._calendarNode.selectedDate) {
        this._calendarNode.focusSelectedDate();
      } else {
        this._calendarNode.focusCentralDate();
      }
    }
  }

  /**
   * @param {{ target: { selectedDate: Date }}} opts
   */
  _onCalendarUserSelectedChanged({ target: { selectedDate } }) {
    if (this._hideOnUserSelect) {
      this._overlayCtrl.hide();
    }
    if (this._syncOnUserSelect) {
      // Synchronize new selectedDate value to input
      this.modelValue = selectedDate;
    }
  }

  /**
   * The LionCalendar shouldn't know anything about the modelValue;
   * it can't handle Unparseable dates, but does handle 'undefined'
   * @param {?} modelValue
   * @returns {Date|undefined} a 'guarded' modelValue
   */
  static __getSyncDownValue(modelValue) {
    return modelValue instanceof Date ? modelValue : undefined;
  }

  /**
   * Validators contain the information to synchronize the input with
   * the min, max and enabled dates of the calendar.
   * @param {import('@lion/form-core').Validator[]} validators - errorValidators or warningValidators array
   */
  __syncDisabledDates(validators) {
    // On every validator change, synchronize disabled dates: this means
    // we need to extract minDate, maxDate, minMaxDate and disabledDates validators
    validators.forEach(v => {
      const vctor = /** @type {typeof import('@lion/form-core').Validator} */ (v.constructor);
      if (vctor.validatorName === 'MinDate') {
        this.__calendarMinDate = v.param;
      } else if (vctor.validatorName === 'MaxDate') {
        this.__calendarMaxDate = v.param;
      } else if (vctor.validatorName === 'MinMaxDate') {
        this.__calendarMinDate = v.param.min;
        this.__calendarMaxDate = v.param.max;
      } else if (vctor.validatorName === 'IsDateDisabled') {
        this.__calendarDisableDates = v.param;
      }
    });
  }

  /**
   * @override Configures OverlayMixin
   */
  get _overlayInvokerNode() {
    return this._invokerNode;
  }

  /**
   * @override Configures OverlayMixin
   */
  get _overlayContentNode() {
    if (this._cachedOverlayContentNode) {
      return this._cachedOverlayContentNode;
    }
    this._cachedOverlayContentNode = /** @type {HTMLElement} */ (
      /** @type {ShadowRoot} */ (this.shadowRoot).querySelector('.calendar__overlay-frame')
    );
    return this._cachedOverlayContentNode;
  }
}

customElements.define('lion-input-datepicker', LionInputDatepicker);

/**
 * @desc LionFieldset is basically a 'sub form' and can have its own nested sub forms.
 * It mimics the native <fieldset> element in this sense, but has all the functionality of
 * a FormControl (advanced styling, validation, interaction states etc.) Also see
 * FormGroupMixin it depends on.
 *
 * LionFieldset enables the '_isFormOrFieldset' flag in FormRegistrarMixin. This makes .formElements
 * act not only as an array, but also as an object (see FormRegistarMixin for more information).
 * As a bonus, It can also group children having names ending with '[]'.
 *
 * Above will be  helpful for both forms and sub forms, which can contain sub forms as children
 * as well and allow for a nested form structure.
 * Contrary, other form groups (choice groups like radio-group, checkbox-group and (multi)select)
 * don't: they should be considered 'end nodes' or 'leaves' of the form and their children/formElements
 * cannot be accessed individually via object keys.
 *
 * @customElement lion-fieldset
 */
class LionFieldset extends FormGroupMixin(LitElement) {
  constructor() {
    super();
    /** @override FormRegistrarMixin */
    this._isFormOrFieldset = true;
    /**
     * @type {'child' | 'choice-group' | 'fieldset'}
     * @override FormControlMixin
     */
    this._repropagationRole = 'fieldset';
  }
}

const throwFormNodeError = () => {
  throw new Error(
    'No form node found. Did you put a <form> element inside your custom-form element?',
  );
};

/**
 * LionForm: form wrapper providing extra features and integration with lion-field elements.
 *
 * @customElement lion-form
 */
// eslint-disable-next-line no-unused-vars
class LionForm extends LionFieldset {
  constructor() {
    super();
    this._submit = this._submit.bind(this);
    this._reset = this._reset.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.__registerEventsForLionForm();

    // @override LionFieldset: makes sure a11y is handled by ._formNode
    this.removeAttribute('role');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.__teardownEventsForLionForm();
  }

  get _formNode() {
    return /** @type {HTMLFormElement} */ (this.querySelector('form'));
  }

  submit() {
    if (this._formNode) {
      // Firefox requires cancelable flag, otherwise we cannot preventDefault
      // Firefox still runs default handlers for untrusted events :\
      this._formNode.dispatchEvent(new Event('submit', { cancelable: true }));
    } else {
      throwFormNodeError();
    }
  }

  /**
   * @param {Event} ev
   */
  _submit(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    this.submitGroup();
    this.dispatchEvent(new Event('submit', { bubbles: true }));
  }

  reset() {
    if (this._formNode) {
      this._formNode.reset();
    } else {
      throwFormNodeError();
    }
  }

  /**
   * @param {Event} ev
   */
  _reset(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    this.resetGroup();
    this.dispatchEvent(new Event('reset', { bubbles: true }));
  }

  __registerEventsForLionForm() {
    this._formNode.addEventListener('submit', this._submit);
    this._formNode.addEventListener('reset', this._reset);
  }

  __teardownEventsForLionForm() {
    this._formNode.removeEventListener('submit', this._submit);
    this._formNode.removeEventListener('reset', this._reset);
  }
}

customElements.define('lion-form', LionForm);
