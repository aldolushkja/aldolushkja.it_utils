import {html, render} from '../lib/lit-html.js';

class NotFound extends HTMLElement {
  connectedCallback() {
    let template = html`
      <h1>404</h1>
      <h2>Page is not found :-(</h2>
    `;
    render(template, this);
  }
}

customElements.define('x-not-found-view', NotFound);