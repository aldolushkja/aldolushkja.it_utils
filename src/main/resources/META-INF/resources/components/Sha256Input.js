import {html, render} from '../lib/lit-html.js';
import {buildSha256} from '../service/HashService.js';
import './TimeElements.js';

class Sha256Input extends HTMLElement {
  connectedCallback() {
    this._render();
  }

  _render() {
    const template = html`
      <div class="card-content">
        <div style="display=flex;flex-direction:column;">
          <h2>Generate SHA256</h2>
          <textarea id="textArea"
                    style="width: 70%; height: 10rem;"></textarea><br>
          <button class="button mt-2  is-primary is-rounded" id="sha1Btn"
                  @click="${e => this.genSha256()}">Genera
          </button>
          <button class="button mt-2 is-info is-light is-rounded"
                  id="randomText" @click="${e => this.insertRandomContent()}">
            Random text
          </button>
          <textarea id="output" style="visibility: hidden;"></textarea><br>
        </div>
      </div>
    `;
    render(template, this);
  }

  isEmpty(string) {
    return (!string || 0 === string.length);
  }

  genSha256() {
    this.plainText = document.getElementById('textArea');
    const input = this.plainText.innerHTML;
    console.log('input sha256: ' + input);
    if (this.isEmpty(input)) {
      alert("Inserire testo prima di proseguire");
      return;
    }
    buildSha256(input);
  }

  async insertRandomContent() {
    this.plainText = document.getElementById('textArea');
    const response = await fetch('http://localhost:6080/faker');
    const text = await response.text();
    this.plainText.innerHTML = text;
  }
}

customElements.define('sha256-input', Sha256Input);