import { html, render } from './lib/lit-html.js';
import { generateSha1 } from './service/HashService.js';

class Sha1Input extends HTMLElement {

    constructor() {
        super();
    }
    connectedCallback() {
        // this.defaultSha1 = generateSha1('sample');
        // console.log('default: ' + this.defaultSha1);
        this._render();
    }

    _render() {
        const template = html `
            <div class="card-content">
                <div style="display=flex;flex-direction:column;">
                    <h2>Generate SHA1</h2>
                    <textarea id="plainText" ></textarea><br>
                    <button id="sha1Btn"  @click="${e => this.genSha1()}">Genera</button>
                    <button id="randomText" @click="${e => this.insertRandomContent()}">Random text</button>
                </div>
            </div>
        `;
        render(template, this);
    }

    isEmpty(string) {
        return (!string || 0 === string.length);
    }

    genSha1() {
        this.plainText = document.getElementById('plainText');
        const input = this.plainText.innerHTML;
        console.log('input sha1: ' + input);
        if (this.isEmpty(input)) {
            alert("Inserire testo prima di proseguire");
            // plainText.innerText = '';
            return;
        }
        generateSha1(input);
    }
    insertRandomContent() {
        this.plainText = document.getElementById('plainText');
        this.plainText.innerHTML = 'Random content to hash...';
    }
}

customElements.define('sha1-input', Sha1Input);