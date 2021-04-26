import "./Sha1Input.js";
import "./Sha1Output.js";

class Sha1Container extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <sha1-input></sha1-input>
      <sha1-output></sha1-output>`
  }

}

customElements.define("x-sha1-view", Sha1Container);