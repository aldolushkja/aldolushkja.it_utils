import "./Sha256Input.js";
import "./Sha256Output.js";

class Sha256Container extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
<div class="card">
  <div class="card-content">
    <div class="content">
      <sha256-input></sha256-input>
      <sha256-output></sha256-output>
</div>
</div>
</div>`
  }

}

customElements.define("x-sha256-view", Sha256Container);