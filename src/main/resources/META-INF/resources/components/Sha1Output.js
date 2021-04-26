import {html, render} from "../lib/lit-html.js";

class Sha1Output extends HTMLElement {

  connectedCallback() {
    this.template = html`
      waiting for sha1 to be produced...
    `;
    render(this.template, this);
    addEventListener('sha1-event', e => this.onMessage(e))
  }

  onMessage({detail}) {
    this.innerHTML = `<h3>Current sha1 for input text is: </h3>${detail}`
  }
}

customElements.define("sha1-output", Sha1Output);