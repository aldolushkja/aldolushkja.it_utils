import './lib/time-elements.js';

class TimeElements extends HTMLElement {
  connectedCallback() {
    const now = new Date();
    const some = "2021-03-16T23:40:02.745Z";
    console.log(now.toISOString());
    this.innerHTML = `
        <relative-time datetime="${some}"></relative-time>
        `;
  }
}

customElements.define('time-elements', TimeElements);