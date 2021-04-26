import {html, render} from "../lib/lit-html.js";

class Base64EncodeOutput extends HTMLElement {

  connectedCallback() {
    this.template = html`
      <div class="content mt-3">
        Waiting for base64 to be produced...
      </div>
    `;
    render(this.template, this);
    addEventListener('base64-encode-event', e => this.onMessage(e))
  }

  onMessage({detail}) {
    this.innerHTML = `<div class="content mt-3" style="word-break: break-all" ><h3>Base64 produced for input text is: </h3><p id="content">${detail}</p></div> `
  }
}

customElements.define("base64-output", Base64EncodeOutput);