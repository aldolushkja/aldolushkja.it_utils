import "./components/Home.js";
import "./components/NotFound.js";
import "./components/Sha1Container.js";
import "./components/Sha256Container.js";
import "./components/Base64EncodeContainer.js";
import "./components/TimeElements.js";
import {Router} from './lib/vaadin-router.js';

const outlet = document.querySelector('#view');
const router = new Router(outlet);
router.setRoutes([
  {path: '/', component: 'x-home-view'},
  {path: '/sha1', component: 'x-sha1-view'},
  {path: '/sha256', component: 'x-sha256-view'},
  {path: '/base64', component: 'x-base64-view'},
  {path: '(.*)', component: 'x-not-found-view'},
]);