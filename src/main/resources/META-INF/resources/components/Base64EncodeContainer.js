import "./Base64Encode.js";
import "./Base64Output.js";

class Base64EncodeContainer extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
<div class="card">
  <div class="card-content">
    <div class="content">
<!--        <div class="tabs">-->
<!--  <ul>-->
<!--    <li class="is-active"><a href="/base64/encode">Encode</a></li>-->
<!--    <li><a href="/base64/decode">Decode</a></li>-->
<!--  </ul>-->
<!--</div>-->
<base64-encode></base64-encode>
<base64-output></base64-output>
</div>
</div>
</div>`
  }

}

customElements.define("x-base64-view", Base64EncodeContainer);