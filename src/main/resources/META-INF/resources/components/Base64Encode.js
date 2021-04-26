import {html, render} from '../lib/lit-html.js';
import {encodeBase64} from '../service/HashService.js';
import './TimeElements.js';

class Base64Encode extends HTMLElement {
  connectedCallback() {
    this._render();
  }

  _render() {
    const template = html`
      <div>
        <div style="display=flex;flex-direction:column;">
          <h2>Encode with Base64</h2>
          <textarea id="textArea"
                    style="width: 70%; height: 10rem;"></textarea><br>
          <button class="button mt-2  is-primary is-rounded" id="sha1Btn"
                  @click="${e => this.encodeBase64()}">Genera
          </button>
          <button class="button mt-2 is-info is-light is-rounded"
                  id="randomText" @click="${e => this.insertRandomContent()}">
            Random
          </button>
          <button class="button mt-2 is-warning is-rounded"
                  id="randomText" @click="${e => this.cleanTextArea()}">
            Pulisci
          </button>
        </div>
      </div>
    `;
    render(template, this);
  }

  isEmpty(string) {
    return (!string || 0 === string.length);
  }

  encodeBase64() {
    this.plainText = document.getElementById('textArea');
    const input = this.plainText.innerHTML;
    console.log('input base64: ' + input);
    if (this.isEmpty(input)) {
      alert("Inserire testo prima di proseguire");
      return;
    }
    encodeBase64(input);
  }

  async insertRandomContent() {
    this.plainText = document.getElementById('textArea');
    const response = await fetch('http://localhost:6080/faker');
    const text = await response.text();
    this.plainText.innerHTML = text;
  }

  cleanTextArea() {
    let textArea = document.getElementById('textArea');
    let output = document.getElementById('content');
    textArea.innerHTML = '';
    textArea.innerText = '';
    output.innerHTML = '';
    output.innerText = '';
  }
}

customElements.define('base64-encode', Base64Encode);