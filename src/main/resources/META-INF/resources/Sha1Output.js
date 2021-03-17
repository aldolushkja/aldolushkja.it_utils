import { html, render } from "./lib/lit-html.js";
import "./lib/ing-lion.js";
class Sha1Output extends HTMLElement {
    onMessage({ detail }) {
        this.appendChild(` < strong > Generated at: $ { detail } < /strong>`);
    }

    submitHandler = (ev) => {
        // if (ev.target.hasFeedbackFor.includes('error')) {
        //     const firstFormElWithError = ev.target.formElements.find(el =>
        //         el.hasFeedbackFor.includes('error'),
        //     );
        //     firstFormElWithError.focus();
        //     return;
        // }
        const formData = ev.target.serializedValue;
        console.log(formData);
        fetch('/api/foo/', {
            method: 'POST',
            body: JSON.stringify(formData),
        });
    };
    submitViaJS(ev) {
        // Call submit on the lion-form element, in your own code you should use
        // a selector that's not dependent on DOM structure like this one.
        ev.target.previousElementSibling.submit();
    };

    connectedCallback() {
        // loadDefaultFeedbackMessages();
        this.template = html ` <
        <lion-form @submit=${submitHandler}>
        <form @submit=${ev => ev.preventDefault()}>
          <lion-input
            name="first_name"
            label="First Name"
          ></lion-input>
          <lion-input
            name="last_name"
            label="Last Name"
          ></lion-input>
          <div style="display:flex">
            <button>Submit</button>
            <button
              type="button"
              @click=${ev => ev.currentTarget.parentElement.parentElement.parentElement.resetGroup()}
            >
              Reset
            </button>
          </div>
        </form>
      </lion-form>
      <button @click=${e => this.submitViaJS(e)}>Explicit submit via JavaScript</button>
        `;
        render(this.template, this);
        this.addEventListener('sha1-event', e => this.onMessage(e));
    }
}
customElements.define("sha1-output", Sha1Output);