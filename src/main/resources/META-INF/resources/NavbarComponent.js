class Navbar extends HTMLElement {
    constructor() {
        console.log('Hello navbar')
    }
}

customElements.define('wc-navbar', Navbar)