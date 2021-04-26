import {html, render} from '../lib/lit-html.js';
import {buildSha1} from '../service/HashService.js';
import './TimeElements.js';

class Sha1Input extends HTMLElement {
  connectedCallback() {
    this._render();
  }

  _render() {
    const template = html`
      <div class="card-content">
        <div style="display=flex;flex-direction:column;">
          <time-elements></time-elements>
          <h2>Generate SHA1</h2>
          <textarea id="textArea"
                    style="width: 70%; height: 10rem;"></textarea><br>
          <button id="sha1Btn" @click="${e => this.genSha1()}">Genera</button>
          <button id="randomText" @click="${e => this.insertRandomContent()}">
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

  genSha1() {
    this.plainText = document.getElementById('textArea');
    const input = this.plainText.innerHTML;
    console.log('input sha1: ' + input);
    if (this.isEmpty(input)) {
      alert("Inserire testo prima di proseguire");
      return;
    }
    buildSha1(input);
  }

  async insertRandomContent() {
    this.plainText = document.getElementById('textArea');
    const response = await fetch('http://localhost:6080/faker');
    const text = await response.text();
    this.plainText.innerHTML = text;
  }
}

customElements.define('sha1-input', Sha1Input);