import {html, render} from "../lib/lit-html.js";

class Sha256Output extends HTMLElement {

  connectedCallback() {
    this.template = html`
      waiting for sha256 to be produced...
    `;
    render(this.template, this);
    addEventListener('sha256-event', e => this.onMessage(e))
  }

  onMessage({detail}) {
    this.innerHTML = `<h3>Current sha256 for input text is: </h3>${detail}`
  }
}

customElements.define("sha256-output", Sha256Output);