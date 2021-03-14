// import HelloService from "./HelloService.js"

class CodeOne extends HTMLElement {
    constructor() {
        super();
        this.answer = 42;
        // this.hello = new HelloService();
        console.log(this.hello);
    }

    connectedCallback() {
        this.fetchFromServer();
        this.innerHTML = `
        <h2>hello friend ${this.answer} - ${this.getAttribute("message")} - </h2>
        `;
        // ${hello.hello()}

    }

    async fetchFromServer() {
        const response = await fetch("message.json");
        const json = await response.json();
        const { filename, contentType } = this.json;
        console.log(filename + contentType)
            // console.log(json)
    }
}

customElements.define("code-one", CodeOne);