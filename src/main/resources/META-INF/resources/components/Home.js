import {html, render} from '../lib/lit-html.js';

class Home extends HTMLElement {
  connectedCallback() {
    let template = html`
      <h1>This is the home page</h1>
      <div class="card">
        <div class="card-content">
          <div class="content">
            Lorem ipsum leo risus, porta ac consectetur ac, vestibulum at eros.
            Donec id elit non mi
            porta gravida at eget metus. Cum sociis natoque penatibus et magnis
            dis parturient montes,
            nascetur ridiculus mus. Cras mattis consectetur purus sit amet
            fermentum.
          </div>
        </div>
      </div>
    `;
    render(template, this);
  }
}

customElements.define('x-home-view', Home);