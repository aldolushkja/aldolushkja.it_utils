import {html, render} from '../lib/lit-html.js';

class Home extends HTMLElement {
  connectedCallback() {
    let template = html`
      <h1>This is the home page</h1>
    `;
    render(template, this);
  }
}

customElements.define('x-home-view', Home);