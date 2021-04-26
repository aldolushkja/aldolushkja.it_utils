import "./Sha1Input.js";
import "./Sha1Output.js";

class Sha1Container extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
<div class="card">
  <div class="card-content">
    <div class="content">
      <sha1-input></sha1-input>
      <sha1-output></sha1-output>
    </div>
  </div>
</div>
`
  }

}

customElements.define("x-sha1-view", Sha1Container);