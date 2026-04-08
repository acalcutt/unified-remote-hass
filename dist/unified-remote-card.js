var Pe=Object.defineProperty;var Me=Object.getOwnPropertyDescriptor;var f=(s,t,e,i)=>{for(var r=i>1?void 0:i?Me(t,e):t,o=s.length-1,n;o>=0;o--)(n=s[o])&&(r=(i?n(t,e,r):n(r))||r);return i&&r&&Pe(t,e,r),r};var q=globalThis,j=q.ShadowRoot&&(q.ShadyCSS===void 0||q.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,G=Symbol(),ne=new WeakMap,D=class{constructor(t,e,i){if(this._$cssResult$=!0,i!==G)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e}get styleSheet(){let t=this.o,e=this.t;if(j&&t===void 0){let i=e!==void 0&&e.length===1;i&&(t=ne.get(e)),t===void 0&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),i&&ne.set(e,t))}return t}toString(){return this.cssText}},ae=s=>new D(typeof s=="string"?s:s+"",void 0,G),L=(s,...t)=>{let e=s.length===1?s[0]:t.reduce((i,r,o)=>i+(n=>{if(n._$cssResult$===!0)return n.cssText;if(typeof n=="number")return n;throw Error("Value passed to 'css' function must be a 'css' function result: "+n+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(r)+s[o+1],s[0]);return new D(e,s,G)},ce=(s,t)=>{if(j)s.adoptedStyleSheets=t.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(let e of t){let i=document.createElement("style"),r=q.litNonce;r!==void 0&&i.setAttribute("nonce",r),i.textContent=e.cssText,s.appendChild(i)}},J=j?s=>s:s=>s instanceof CSSStyleSheet?(t=>{let e="";for(let i of t.cssRules)e+=i.cssText;return ae(e)})(s):s;var{is:De,defineProperty:Le,getOwnPropertyDescriptor:Oe,getOwnPropertyNames:Ie,getOwnPropertySymbols:Ne,getPrototypeOf:Ue}=Object,x=globalThis,le=x.trustedTypes,He=le?le.emptyScript:"",Re=x.reactiveElementPolyfillSupport,O=(s,t)=>s,I={toAttribute(s,t){switch(t){case Boolean:s=s?He:null;break;case Object:case Array:s=s==null?s:JSON.stringify(s)}return s},fromAttribute(s,t){let e=s;switch(t){case Boolean:e=s!==null;break;case Number:e=s===null?null:Number(s);break;case Object:case Array:try{e=JSON.parse(s)}catch{e=null}}return e}},V=(s,t)=>!De(s,t),ue={attribute:!0,type:String,converter:I,reflect:!1,useDefault:!1,hasChanged:V};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),x.litPropertyMetadata??(x.litPropertyMetadata=new WeakMap);var _=class extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??(this.l=[])).push(t)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,e=ue){if(e.state&&(e.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(t)&&((e=Object.create(e)).wrapped=!0),this.elementProperties.set(t,e),!e.noAccessor){let i=Symbol(),r=this.getPropertyDescriptor(t,i,e);r!==void 0&&Le(this.prototype,t,r)}}static getPropertyDescriptor(t,e,i){let{get:r,set:o}=Oe(this.prototype,t)??{get(){return this[e]},set(n){this[e]=n}};return{get:r,set(n){let c=r?.call(this);o?.call(this,n),this.requestUpdate(t,c,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??ue}static _$Ei(){if(this.hasOwnProperty(O("elementProperties")))return;let t=Ue(this);t.finalize(),t.l!==void 0&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties)}static finalize(){if(this.hasOwnProperty(O("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(O("properties"))){let e=this.properties,i=[...Ie(e),...Ne(e)];for(let r of i)this.createProperty(r,e[r])}let t=this[Symbol.metadata];if(t!==null){let e=litPropertyMetadata.get(t);if(e!==void 0)for(let[i,r]of e)this.elementProperties.set(i,r)}this._$Eh=new Map;for(let[e,i]of this.elementProperties){let r=this._$Eu(e,i);r!==void 0&&this._$Eh.set(r,e)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(t){let e=[];if(Array.isArray(t)){let i=new Set(t.flat(1/0).reverse());for(let r of i)e.unshift(J(r))}else t!==void 0&&e.push(J(t));return e}static _$Eu(t,e){let i=e.attribute;return i===!1?void 0:typeof i=="string"?i:typeof t=="string"?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(t=>t(this))}addController(t){(this._$EO??(this._$EO=new Set)).add(t),this.renderRoot!==void 0&&this.isConnected&&t.hostConnected?.()}removeController(t){this._$EO?.delete(t)}_$E_(){let t=new Map,e=this.constructor.elementProperties;for(let i of e.keys())this.hasOwnProperty(i)&&(t.set(i,this[i]),delete this[i]);t.size>0&&(this._$Ep=t)}createRenderRoot(){let t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return ce(t,this.constructor.elementStyles),t}connectedCallback(){this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),this._$EO?.forEach(t=>t.hostConnected?.())}enableUpdating(t){}disconnectedCallback(){this._$EO?.forEach(t=>t.hostDisconnected?.())}attributeChangedCallback(t,e,i){this._$AK(t,i)}_$ET(t,e){let i=this.constructor.elementProperties.get(t),r=this.constructor._$Eu(t,i);if(r!==void 0&&i.reflect===!0){let o=(i.converter?.toAttribute!==void 0?i.converter:I).toAttribute(e,i.type);this._$Em=t,o==null?this.removeAttribute(r):this.setAttribute(r,o),this._$Em=null}}_$AK(t,e){let i=this.constructor,r=i._$Eh.get(t);if(r!==void 0&&this._$Em!==r){let o=i.getPropertyOptions(r),n=typeof o.converter=="function"?{fromAttribute:o.converter}:o.converter?.fromAttribute!==void 0?o.converter:I;this._$Em=r;let c=n.fromAttribute(e,o.type);this[r]=c??this._$Ej?.get(r)??c,this._$Em=null}}requestUpdate(t,e,i,r=!1,o){if(t!==void 0){let n=this.constructor;if(r===!1&&(o=this[t]),i??(i=n.getPropertyOptions(t)),!((i.hasChanged??V)(o,e)||i.useDefault&&i.reflect&&o===this._$Ej?.get(t)&&!this.hasAttribute(n._$Eu(t,i))))return;this.C(t,e,i)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(t,e,{useDefault:i,reflect:r,wrapped:o},n){i&&!(this._$Ej??(this._$Ej=new Map)).has(t)&&(this._$Ej.set(t,n??e??this[t]),o!==!0||n!==void 0)||(this._$AL.has(t)||(this.hasUpdated||i||(e=void 0),this._$AL.set(t,e)),r===!0&&this._$Em!==t&&(this._$Eq??(this._$Eq=new Set)).add(t))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(e){Promise.reject(e)}let t=this.scheduleUpdate();return t!=null&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(let[r,o]of this._$Ep)this[r]=o;this._$Ep=void 0}let i=this.constructor.elementProperties;if(i.size>0)for(let[r,o]of i){let{wrapped:n}=o,c=this[r];n!==!0||this._$AL.has(r)||c===void 0||this.C(r,void 0,o,c)}}let t=!1,e=this._$AL;try{t=this.shouldUpdate(e),t?(this.willUpdate(e),this._$EO?.forEach(i=>i.hostUpdate?.()),this.update(e)):this._$EM()}catch(i){throw t=!1,this._$EM(),i}t&&this._$AE(e)}willUpdate(t){}_$AE(t){this._$EO?.forEach(e=>e.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return!0}update(t){this._$Eq&&(this._$Eq=this._$Eq.forEach(e=>this._$ET(e,this[e]))),this._$EM()}updated(t){}firstUpdated(t){}};_.elementStyles=[],_.shadowRootOptions={mode:"open"},_[O("elementProperties")]=new Map,_[O("finalized")]=new Map,Re?.({ReactiveElement:_}),(x.reactiveElementVersions??(x.reactiveElementVersions=[])).push("2.1.2");var U=globalThis,de=s=>s,Y=U.trustedTypes,pe=Y?Y.createPolicy("lit-html",{createHTML:s=>s}):void 0,ye="$lit$",k=`lit$${Math.random().toFixed(9).slice(2)}$`,_e="?"+k,ze=`<${_e}>`,S=document,H=()=>S.createComment(""),R=s=>s===null||typeof s!="object"&&typeof s!="function",oe=Array.isArray,Fe=s=>oe(s)||typeof s?.[Symbol.iterator]=="function",Z=`[ 	
\f\r]`,N=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,he=/-->/g,me=/>/g,$=RegExp(`>|${Z}(?:([^\\s"'>=/]+)(${Z}*=${Z}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),fe=/'/g,ge=/"/g,ve=/^(?:script|style|textarea|title)$/i,se=s=>(t,...e)=>({_$litType$:s,strings:t,values:e}),m=se(1),it=se(2),rt=se(3),T=Symbol.for("lit-noChange"),u=Symbol.for("lit-nothing"),be=new WeakMap,A=S.createTreeWalker(S,129);function we(s,t){if(!oe(s)||!s.hasOwnProperty("raw"))throw Error("invalid template strings array");return pe!==void 0?pe.createHTML(t):t}var Ke=(s,t)=>{let e=s.length-1,i=[],r,o=t===2?"<svg>":t===3?"<math>":"",n=N;for(let c=0;c<e;c++){let a=s[c],l,h,d=-1,y=0;for(;y<a.length&&(n.lastIndex=y,h=n.exec(a),h!==null);)y=n.lastIndex,n===N?h[1]==="!--"?n=he:h[1]!==void 0?n=me:h[2]!==void 0?(ve.test(h[2])&&(r=RegExp("</"+h[2],"g")),n=$):h[3]!==void 0&&(n=$):n===$?h[0]===">"?(n=r??N,d=-1):h[1]===void 0?d=-2:(d=n.lastIndex-h[2].length,l=h[1],n=h[3]===void 0?$:h[3]==='"'?ge:fe):n===ge||n===fe?n=$:n===he||n===me?n=N:(n=$,r=void 0);let w=n===$&&s[c+1].startsWith("/>")?" ":"";o+=n===N?a+ze:d>=0?(i.push(l),a.slice(0,d)+ye+a.slice(d)+k+w):a+k+(d===-2?c:w)}return[we(s,o+(s[e]||"<?>")+(t===2?"</svg>":t===3?"</math>":"")),i]},z=class s{constructor({strings:t,_$litType$:e},i){let r;this.parts=[];let o=0,n=0,c=t.length-1,a=this.parts,[l,h]=Ke(t,e);if(this.el=s.createElement(l,i),A.currentNode=this.el.content,e===2||e===3){let d=this.el.content.firstChild;d.replaceWith(...d.childNodes)}for(;(r=A.nextNode())!==null&&a.length<c;){if(r.nodeType===1){if(r.hasAttributes())for(let d of r.getAttributeNames())if(d.endsWith(ye)){let y=h[n++],w=r.getAttribute(d).split(k),B=/([.?@])?(.*)/.exec(y);a.push({type:1,index:o,name:B[2],strings:w,ctor:B[1]==="."?ee:B[1]==="?"?te:B[1]==="@"?ie:P}),r.removeAttribute(d)}else d.startsWith(k)&&(a.push({type:6,index:o}),r.removeAttribute(d));if(ve.test(r.tagName)){let d=r.textContent.split(k),y=d.length-1;if(y>0){r.textContent=Y?Y.emptyScript:"";for(let w=0;w<y;w++)r.append(d[w],H()),A.nextNode(),a.push({type:2,index:++o});r.append(d[y],H())}}}else if(r.nodeType===8)if(r.data===_e)a.push({type:2,index:o});else{let d=-1;for(;(d=r.data.indexOf(k,d+1))!==-1;)a.push({type:7,index:o}),d+=k.length-1}o++}}static createElement(t,e){let i=S.createElement("template");return i.innerHTML=t,i}};function C(s,t,e=s,i){if(t===T)return t;let r=i!==void 0?e._$Co?.[i]:e._$Cl,o=R(t)?void 0:t._$litDirective$;return r?.constructor!==o&&(r?._$AO?.(!1),o===void 0?r=void 0:(r=new o(s),r._$AT(s,e,i)),i!==void 0?(e._$Co??(e._$Co=[]))[i]=r:e._$Cl=r),r!==void 0&&(t=C(s,r._$AS(s,t.values),r,i)),t}var Q=class{constructor(t,e){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=e}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){let{el:{content:e},parts:i}=this._$AD,r=(t?.creationScope??S).importNode(e,!0);A.currentNode=r;let o=A.nextNode(),n=0,c=0,a=i[0];for(;a!==void 0;){if(n===a.index){let l;a.type===2?l=new F(o,o.nextSibling,this,t):a.type===1?l=new a.ctor(o,a.name,a.strings,this,t):a.type===6&&(l=new re(o,this,t)),this._$AV.push(l),a=i[++c]}n!==a?.index&&(o=A.nextNode(),n++)}return A.currentNode=S,r}p(t){let e=0;for(let i of this._$AV)i!==void 0&&(i.strings!==void 0?(i._$AI(t,i,e),e+=i.strings.length-2):i._$AI(t[e])),e++}},F=class s{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(t,e,i,r){this.type=2,this._$AH=u,this._$AN=void 0,this._$AA=t,this._$AB=e,this._$AM=i,this.options=r,this._$Cv=r?.isConnected??!0}get parentNode(){let t=this._$AA.parentNode,e=this._$AM;return e!==void 0&&t?.nodeType===11&&(t=e.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,e=this){t=C(this,t,e),R(t)?t===u||t==null||t===""?(this._$AH!==u&&this._$AR(),this._$AH=u):t!==this._$AH&&t!==T&&this._(t):t._$litType$!==void 0?this.$(t):t.nodeType!==void 0?this.T(t):Fe(t)?this.k(t):this._(t)}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t))}_(t){this._$AH!==u&&R(this._$AH)?this._$AA.nextSibling.data=t:this.T(S.createTextNode(t)),this._$AH=t}$(t){let{values:e,_$litType$:i}=t,r=typeof i=="number"?this._$AC(t):(i.el===void 0&&(i.el=z.createElement(we(i.h,i.h[0]),this.options)),i);if(this._$AH?._$AD===r)this._$AH.p(e);else{let o=new Q(r,this),n=o.u(this.options);o.p(e),this.T(n),this._$AH=o}}_$AC(t){let e=be.get(t.strings);return e===void 0&&be.set(t.strings,e=new z(t)),e}k(t){oe(this._$AH)||(this._$AH=[],this._$AR());let e=this._$AH,i,r=0;for(let o of t)r===e.length?e.push(i=new s(this.O(H()),this.O(H()),this,this.options)):i=e[r],i._$AI(o),r++;r<e.length&&(this._$AR(i&&i._$AB.nextSibling,r),e.length=r)}_$AR(t=this._$AA.nextSibling,e){for(this._$AP?.(!1,!0,e);t!==this._$AB;){let i=de(t).nextSibling;de(t).remove(),t=i}}setConnected(t){this._$AM===void 0&&(this._$Cv=t,this._$AP?.(t))}},P=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,e,i,r,o){this.type=1,this._$AH=u,this._$AN=void 0,this.element=t,this.name=e,this._$AM=r,this.options=o,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=u}_$AI(t,e=this,i,r){let o=this.strings,n=!1;if(o===void 0)t=C(this,t,e,0),n=!R(t)||t!==this._$AH&&t!==T,n&&(this._$AH=t);else{let c=t,a,l;for(t=o[0],a=0;a<o.length-1;a++)l=C(this,c[i+a],e,a),l===T&&(l=this._$AH[a]),n||(n=!R(l)||l!==this._$AH[a]),l===u?t=u:t!==u&&(t+=(l??"")+o[a+1]),this._$AH[a]=l}n&&!r&&this.j(t)}j(t){t===u?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}},ee=class extends P{constructor(){super(...arguments),this.type=3}j(t){this.element[this.name]=t===u?void 0:t}},te=class extends P{constructor(){super(...arguments),this.type=4}j(t){this.element.toggleAttribute(this.name,!!t&&t!==u)}},ie=class extends P{constructor(t,e,i,r,o){super(t,e,i,r,o),this.type=5}_$AI(t,e=this){if((t=C(this,t,e,0)??u)===T)return;let i=this._$AH,r=t===u&&i!==u||t.capture!==i.capture||t.once!==i.once||t.passive!==i.passive,o=t!==u&&(i===u||r);r&&this.element.removeEventListener(this.name,this,i),o&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,t):this._$AH.handleEvent(t)}},re=class{constructor(t,e,i){this.element=t,this.type=6,this._$AN=void 0,this._$AM=e,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(t){C(this,t)}};var Be=U.litHtmlPolyfillSupport;Be?.(z,F),(U.litHtmlVersions??(U.litHtmlVersions=[])).push("3.3.2");var xe=(s,t,e)=>{let i=e?.renderBefore??t,r=i._$litPart$;if(r===void 0){let o=e?.renderBefore??null;i._$litPart$=r=new F(t.insertBefore(H(),o),o,void 0,e??{})}return r._$AI(s),r};var K=globalThis,b=class extends _{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var e;let t=super.createRenderRoot();return(e=this.renderOptions).renderBefore??(e.renderBefore=t.firstChild),t}update(t){let e=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=xe(e,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return T}};b._$litElement$=!0,b.finalized=!0,K.litElementHydrateSupport?.({LitElement:b});var qe=K.litElementPolyfillSupport;qe?.({LitElement:b});(K.litElementVersions??(K.litElementVersions=[])).push("4.2.2");var W=s=>(t,e)=>{e!==void 0?e.addInitializer(()=>{customElements.define(s,t)}):customElements.define(s,t)};var je={attribute:!0,type:String,converter:I,reflect:!1,hasChanged:V},Ve=(s=je,t,e)=>{let{kind:i,metadata:r}=e,o=globalThis.litPropertyMetadata.get(r);if(o===void 0&&globalThis.litPropertyMetadata.set(r,o=new Map),i==="setter"&&((s=Object.create(s)).wrapped=!0),o.set(e.name,s),i==="accessor"){let{name:n}=e;return{set(c){let a=t.get.call(this);t.set.call(this,c),this.requestUpdate(n,a,s,!0,c)},init(c){return c!==void 0&&this.C(n,void 0,s,c),c}}}if(i==="setter"){let{name:n}=e;return function(c){let a=this[n];t.call(this,c),this.requestUpdate(n,a,s,!0,c)}}throw Error("Unsupported decorator location: "+i)};function M(s){return(t,e)=>typeof e=="object"?Ve(s,t,e):((i,r,o)=>{let n=r.hasOwnProperty(o);return r.constructor.createProperty(o,i),n?Object.getOwnPropertyDescriptor(r,o):void 0})(s,t,e)}function v(s){return M({...s,state:!0,attribute:!1})}var ke,$e;(function(s){s.language="language",s.system="system",s.comma_decimal="comma_decimal",s.decimal_comma="decimal_comma",s.space_comma="space_comma",s.none="none"})(ke||(ke={})),function(s){s.language="language",s.system="system",s.am_pm="12",s.twenty_four="24"}($e||($e={}));var Ae=function(s,t,e,i){i=i||{},e=e??{};var r=new Event(t,{bubbles:i.bubbles===void 0||i.bubbles,cancelable:!!i.cancelable,composed:i.composed===void 0||i.composed});return r.detail=e,s.dispatchEvent(r),r};var Ye={show_lock:!0,show_speed_buttons:!0,show_status_text:!0,show_volume_controls:!0,show_media_controls:!0,show_keyboard_button:!0,show_mouse_buttons:!0,invert_scroll:!1},We=[{name:"show_lock",type:"boolean",default:!0},{name:"show_speed_buttons",type:"boolean",default:!0},{name:"show_status_text",type:"boolean",default:!0},{name:"show_volume_controls",type:"boolean",default:!0},{name:"show_media_controls",type:"boolean",default:!0},{name:"show_keyboard_button",type:"boolean",default:!0},{name:"show_mouse_buttons",type:"boolean",default:!0},{name:"sensitivity",type:"float",required:!1},{name:"scroll_multiplier",type:"float",required:!1},{name:"invert_scroll",type:"boolean",default:!1},{name:"double_tap_ms",type:"integer",required:!1},{name:"tap_suppression_px",type:"integer",required:!1}],E=class extends b{constructor(){super(...arguments);this._computeLabel=e=>{switch(e.name){case"show_lock":return"Show LOCK button";case"show_speed_buttons":return"Show speed multiplier buttons (\xD72 \xD73 \xD74)";case"show_status_text":return"Show connection status text";case"show_volume_controls":return"Show volume controls (up / down / mute)";case"show_media_controls":return"Show media controls bar (prev / play-pause / stop / next)";case"show_keyboard_button":return"Show keyboard toggle button";case"show_mouse_buttons":return"Show mouse buttons (left / right click)";case"sensitivity":return"Swipe sensitivity (default 1)";case"scroll_multiplier":return"Scroll multiplier (default 1)";case"invert_scroll":return"Reverse scroll direction";case"double_tap_ms":return"Double-tap window in ms (default 250)";case"tap_suppression_px":return"Max movement allowed for tap in px (default 6)";default:return String(e.name)}}}setConfig(e){this._config={...Ye,...e}}_valueChanged(e){if(!this._config)return;let i=e.detail?.value;if(!i)return;let r=new Set(["sensitivity","scroll_multiplier","double_tap_ms","tap_suppression_px"]),o={};Object.entries(i).forEach(([n,c])=>{let a=n;if(r.has(a)&&(c===""||c===null||Number.isNaN(c))){o[a]=void 0;return}o[a]=c}),this._config={...this._config,...o},Ae(this,"config-changed",{config:this._config})}render(){return this.hass?m`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${We}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `:m``}};E.styles=L`
    ha-form { display: block; padding: 0; }
  `,f([M({attribute:!1})],E.prototype,"hass",2),f([v()],E.prototype,"_config",2),E=f([W("unified-remote-card-editor")],E);var Xe=320,Se=3,Ge="UNIFIED-REMOTE-CARD",Te="background:#1565c0;color:#fff;font-weight:700;padding:2px 6px;border-radius:6px;",Ee="color:#1565c0;font-weight:600;";function Ce(s,t){let e=`%c${Ge}%c ${s}`;if(t!==void 0){console.groupCollapsed(e,Te,Ee),console.warn(t),console.groupEnd();return}console.warn(e,Te,Ee)}var p={sensitivity:1,scrollMultiplier:1,invertScroll:!1,doubleTapMs:250,tapSuppressionPx:6,showLock:!0,showSpeedButtons:!0,showStatusText:!0,showVolumeControls:!0,showMediaControls:!0,showKeyboardButton:!0,showMouseButtons:!0},g=class extends b{constructor(){super(...arguments);this._status="disconnected";this._statusDisplay="disconnected";this._locked=!1;this._speedMultiplier=1;this._keyboardOpen=!1;this.pointers=new Map;this.gesture=null;this.moveAccum={x:0,y:0};this.scrollAccum={x:0,y:0};this.lastTapTime=0;this.dragLocked=!1;this.opts={...p};this.handlePointerDown=e=>{if(this._locked){this.startLockedPan(e);return}e.preventDefault(),this.captureLayer?.setPointerCapture(e.pointerId);let i=this.renderRoot?.querySelector(".keyboard-input");i&&document.activeElement!==document.body&&i.blur();let r=performance.now();this.pointers.set(e.pointerId,{id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,startTime:r}),this.pointers.size===1?(this.gesture="move",this.startHoldTimer(e)):this.pointers.size>=2&&(this.cancelHoldTimer(),this.endDragIfNeeded(),this.gesture="scroll")};this.handlePointerMove=e=>{if(this._locked){this.moveLockedPan(e);return}let i=this.pointers.get(e.pointerId);if(!i)return;e.preventDefault();let r=this.centroid();i.x=e.clientX,i.y=e.clientY,this.pointers.set(e.pointerId,i);let o=this.centroid(),n=Math.hypot(i.x-i.startX,i.y-i.startY);if(this.holdTimer&&n>Se&&this.cancelHoldTimer(),this.pointers.size>=2&&(this.cancelHoldTimer(),this.endDragIfNeeded(),this.gesture="scroll"),this.gesture==="move"&&this.pointers.size===1){let c=this.opts.sensitivity*this._speedMultiplier;this.moveAccum.x+=(o.x-r.x)*c,this.moveAccum.y+=(o.y-r.y)*c,this.queueSend()}else if(this.gesture==="scroll"&&this.pointers.size>=2){let c=this.opts.invertScroll?-1:1;this.scrollAccum.x+=(o.x-r.x)*this.opts.scrollMultiplier*c,this.scrollAccum.y+=(o.y-r.y)*this.opts.scrollMultiplier*c,this.queueSend()}};this.handlePointerUp=e=>{if(this._locked){this.endLockedPan(e);return}let i=this.pointers.get(e.pointerId);if(!i)return;e.preventDefault();let r=this.dragLocked;this.cancelHoldTimer();let o=this.pointers.size,n=performance.now(),c=Math.hypot(e.clientX-i.startX,e.clientY-i.startY),a=n-i.startTime;if(this.pointers.delete(e.pointerId),o===2){let l=[...this.pointers.values()][0];if(l){let h=Math.hypot(l.x-l.startX,l.y-l.startY),d=n-Math.min(i.startTime,l.startTime);if(c<=this.opts.tapSuppressionPx&&h<=this.opts.tapSuppressionPx&&d<=this.opts.doubleTapMs){this.sendTap("right_click"),this.pointers.clear(),this.gesture=null;return}}}if(this.pointers.size===0){let l=this.gesture==="move"&&c<=this.opts.tapSuppressionPx&&a<=this.opts.doubleTapMs;if(r&&l){this.sendButton("up"),this.dragLocked=!1,this.gesture=null;return}!r&&l&&(this.tapTimer&&(clearTimeout(this.tapTimer),this.tapTimer=void 0),n-this.lastTapTime<=this.opts.doubleTapMs?(this.sendTap("double_click"),this.lastTapTime=0):(this.lastTapTime=n,this.tapTimer=window.setTimeout(()=>{this.sendTap("click"),this.lastTapTime=0,this.tapTimer=void 0},this.opts.doubleTapMs))),this.gesture=null}else this.pointers.size===1&&this.gesture==="scroll"&&(this.gesture="move")};this.handlePointerCancel=e=>{if(this._locked){this.endLockedPan(e);return}this.pointers.delete(e.pointerId),this.dragLocked&&(this.sendButton("up"),this.dragLocked=!1),this.cancelHoldTimer(),this.pointers.size===0&&(this.gesture=null)};this.handleKeyboardInput=e=>{let i=e.target,r=e.inputType,o=e.data??"";if(r==="insertText"&&o)this.sendText(o);else if(r==="insertLineBreak")this.sendKey("enter");else if(r==="insertFromPaste"){let n=typeof o=="string"&&o?o:i.value;n&&this.sendText(n)}};this.handleKeyboardKeydown=e=>{let i=this.mapKey(e.key);if(i){i!=="backspace"&&i!=="delete"&&e.preventDefault(),this.sendKey(i);return}if(e.key==="AudioVolumeUp"||e.key==="VolumeUp"){e.preventDefault(),this.sendVolume("up");return}if(e.key==="AudioVolumeDown"||e.key==="VolumeDown"){e.preventDefault(),this.sendVolume("down");return}(e.key==="AudioVolumeMute"||e.key==="VolumeMute")&&(e.preventDefault(),this.sendVolume("mute"))};this.toggleLock=()=>{!this._locked&&this.dragLocked&&(this.sendButton("up"),this.dragLocked=!1),this.cancelHoldTimer(),this.lockedPan=void 0,this._locked=!this._locked,this.persistUiState()};this.toggleKeyboardPanel=()=>{this.opts.showKeyboardButton&&(this._keyboardOpen=!this._keyboardOpen,this.persistUiState(),this._keyboardOpen&&window.setTimeout(()=>{this.renderRoot?.querySelector(".keyboard-input")?.focus()},0))}}static async getConfigElement(){return document.createElement("unified-remote-card-editor")}static getStubConfig(){return{type:"custom:unified-remote-card",show_lock:p.showLock,show_speed_buttons:p.showSpeedButtons,show_status_text:p.showStatusText,show_volume_controls:p.showVolumeControls,show_media_controls:p.showMediaControls,show_keyboard_button:p.showKeyboardButton}}setConfig(e){this._config=e,this.opts={sensitivity:e.sensitivity??p.sensitivity,scrollMultiplier:e.scroll_multiplier??p.scrollMultiplier,invertScroll:e.invert_scroll??p.invertScroll,doubleTapMs:e.double_tap_ms??p.doubleTapMs,tapSuppressionPx:e.tap_suppression_px??p.tapSuppressionPx,showLock:e.show_lock??p.showLock,showSpeedButtons:e.show_speed_buttons??p.showSpeedButtons,showStatusText:e.show_status_text??p.showStatusText,showVolumeControls:e.show_volume_controls??p.showVolumeControls,showMediaControls:e.show_media_controls??p.showMediaControls,showKeyboardButton:e.show_keyboard_button??p.showKeyboardButton,showMouseButtons:e.show_mouse_buttons??p.showMouseButtons},this._locked=!1,this._keyboardOpen=!1,this._speedMultiplier=1,this.restoreUiState()}connectedCallback(){super.connectedCallback(),this.setStatus(this.hass?"connected":"disconnected")}disconnectedCallback(){super.disconnectedCallback();for(let e of[this.tapTimer,this.statusTimer,this.holdTimer])e&&clearTimeout(e);this.tapTimer=this.statusTimer=this.holdTimer=void 0,this.dragLocked&&(this.sendButton("up"),this.dragLocked=!1)}updated(e){super.updated(e),e.has("hass")&&this.setStatus(this.hass?"connected":"disconnected")}storageAvailable(){try{let e=window.localStorage,i="__ur_card_probe__";return e.setItem(i,"1"),e.removeItem(i),e}catch{return null}}persistenceKey(){return this._config?`unified-remote-card:ha:${window?.location?.pathname??""}`:null}restoreUiState(){let e=this.storageAvailable(),i=this.persistenceKey();if(!(!e||!i))try{let r=e.getItem(i);if(!r)return;let o=JSON.parse(r);typeof o.locked=="boolean"&&(this._locked=o.locked),(o.speedMultiplier===1||o.speedMultiplier===2||o.speedMultiplier===3||o.speedMultiplier===4)&&(this._speedMultiplier=o.speedMultiplier),typeof o.keyboardOpen=="boolean"&&this.opts.showKeyboardButton&&(this._keyboardOpen=o.keyboardOpen)}catch(r){Ce("Failed to restore UI state.",r)}}persistUiState(){let e=this.storageAvailable(),i=this.persistenceKey();if(!(!e||!i))try{e.setItem(i,JSON.stringify({locked:this._locked,speedMultiplier:this._speedMultiplier,keyboardOpen:this.opts.showKeyboardButton?this._keyboardOpen:!1}))}catch(r){Ce("Failed to persist UI state.",r)}}setStatus(e){if(this._status=e,this.statusTimer&&(clearTimeout(this.statusTimer),this.statusTimer=void 0),e==="connected"){this._statusDisplay=e;return}this.statusTimer=window.setTimeout(()=>{this._statusDisplay=e,this.statusTimer=void 0},600)}statusLabel(){switch(this._statusDisplay){case"connected":return"PC Connected";default:return"PC Disconnected"}}get captureLayer(){return this.renderRoot.querySelector(".capture")}centroid(){if(this.pointers.size===0)return{x:0,y:0};let e=0,i=0;this.pointers.forEach(o=>{e+=o.x,i+=o.y});let r=this.pointers.size;return{x:e/r,y:i/r}}startLockedPan(e){e.pointerType!=="touch"&&e.pointerType!=="pen"||(this.captureLayer?.setPointerCapture(e.pointerId),this.lockedPan={id:e.pointerId,lastY:e.clientY})}moveLockedPan(e){if(!this.lockedPan||this.lockedPan.id!==e.pointerId||e.pointerType!=="touch"&&e.pointerType!=="pen")return;e.preventDefault();let i=e.clientY-this.lockedPan.lastY;i!==0&&(window.scrollBy({top:-i,behavior:"auto"}),this.lockedPan.lastY=e.clientY)}endLockedPan(e){this.lockedPan?.id===e.pointerId&&(this.lockedPan=void 0),this.captureLayer?.hasPointerCapture?.(e.pointerId)&&this.captureLayer.releasePointerCapture(e.pointerId)}startHoldTimer(e){e.pointerType!=="touch"&&e.pointerType!=="pen"||(this.cancelHoldTimer(),this.holdTimer=window.setTimeout(()=>{let i=this.pointers.get(e.pointerId);if(!i)return;let r=Math.hypot(i.x-i.startX,i.y-i.startY);this.pointers.size===1&&this.gesture==="move"&&!this.dragLocked&&r<=Se&&(this.dragLocked=!0,this.sendButton("down"),navigator?.vibrate&&navigator.vibrate(15)),this.holdTimer=void 0},Xe))}cancelHoldTimer(){this.holdTimer&&(clearTimeout(this.holdTimer),this.holdTimer=void 0)}endDragIfNeeded(e){this.dragLocked&&(e==null||this.dragPointerId===e)&&(this.sendButton("up"),this.dragLocked=!1)}queueSend(){this.rafHandle==null&&(this.rafHandle=window.requestAnimationFrame(()=>{this.rafHandle=void 0,this.flush()}))}flush(){if(!this.hass){this.moveAccum={x:0,y:0},this.scrollAccum={x:0,y:0};return}(Math.abs(this.moveAccum.x)>0||Math.abs(this.moveAccum.y)>0)&&(this.send({t:"move",dx:this.moveAccum.x,dy:this.moveAccum.y}),this.moveAccum={x:0,y:0}),(Math.abs(this.scrollAccum.x)>0||Math.abs(this.scrollAccum.y)>0)&&(this.send({t:"scroll",dx:this.scrollAccum.x,dy:this.scrollAccum.y}),this.scrollAccum={x:0,y:0})}send(e){this.hass&&this.hass.connection.sendMessagePromise({type:"unified_remote/command",...e}).catch(()=>{})}sendTap(e){this.send({t:e})}sendButton(e){this.send({t:e})}sendKey(e){this.send({t:"key",key:e})}sendText(e){e&&this.send({t:"text",text:e})}sendVolume(e){this.send({t:"volume",action:e})}sendMedia(e){this.send({t:"media",action:e})}mapKey(e){switch(e){case"Enter":return"enter";case"Backspace":return"backspace";case"Escape":return"escape";case"Tab":return"tab";case"Delete":return"delete";case" ":case"Spacebar":return"space";case"ArrowLeft":return"arrow_left";case"ArrowRight":return"arrow_right";case"ArrowUp":return"arrow_up";case"ArrowDown":return"arrow_down";case"Home":return"home";case"End":return"end";case"PageUp":return"page_up";case"PageDown":return"page_down";default:return null}}toggleSpeed(e){this._speedMultiplier=this._speedMultiplier===e?1:e,this.persistUiState()}render(){if(!this._config)return u;let e=this.opts.showKeyboardButton&&this._keyboardOpen,i=[{label:"\u2191",key:"arrow_up",cls:"arrow-up",title:"Arrow up"},{label:"\u2190",key:"arrow_left",cls:"arrow-left",title:"Arrow left"},{label:"\u2193",key:"arrow_down",cls:"arrow-down",title:"Arrow down"},{label:"\u2192",key:"arrow_right",cls:"arrow-right",title:"Arrow right"}],r=[{label:"Tab",key:"tab"},{label:"Esc",key:"escape"},{label:"Del",key:"delete"},{label:"Home",key:"home"},{label:"End",key:"end"},{label:"PgUp",key:"page_up"},{label:"PgDn",key:"page_down"},{label:"Ctrl+Alt+Del",key:"ctrl_alt_del"}];return m`
      <ha-card @contextmenu=${o=>o.preventDefault()}>
        <!-- ── Touchpad surface ── -->
        <div class="surface ${this._locked?"locked":""} ${e?"with-keyboard":""}">

          ${this.opts.showSpeedButtons?m`
            <div class="speed-buttons">
              ${[2,3,4].map(o=>m`
                <button class="speed ${this._speedMultiplier===o?"active":""}"
                        @click=${n=>{n.stopPropagation(),this.toggleSpeed(o)}}>
                  &times;${o}
                </button>`)}
            </div>`:u}

          ${this.opts.showLock?m`
            <button class="lock ${this._locked?"active":""}"
                    @click=${o=>{o.stopPropagation(),this.toggleLock()}}>
              LOCK
            </button>`:u}

          ${this.opts.showVolumeControls?m`
            <div class="side-stack right">
              <button class="icon-btn" title="Volume up"   @click=${()=>this.sendVolume("up")}>
                <ha-icon icon="mdi:volume-plus"></ha-icon>
              </button>
              <button class="icon-btn" title="Volume down" @click=${()=>this.sendVolume("down")}>
                <ha-icon icon="mdi:volume-minus"></ha-icon>
              </button>
              <button class="icon-btn" title="Mute"        @click=${()=>this.sendVolume("mute")}>
                <ha-icon icon="mdi:volume-mute"></ha-icon>
              </button>
            </div>`:u}

          ${this.opts.showKeyboardButton?m`
            <button class="keyboard-toggle ${this._keyboardOpen?"active":""}"
                    title="Keyboard"
                    @click=${this.toggleKeyboardPanel}>
              <ha-icon icon="mdi:keyboard-outline"></ha-icon>
            </button>`:u}

          <!-- capture layer — receives all pointer events -->
          <div class="capture"
               @mousedown=${o=>{o.detail>1&&o.preventDefault()}}
               @dblclick=${o=>o.preventDefault()}
               @pointerdown=${this.handlePointerDown}
               @pointermove=${this.handlePointerMove}
               @pointerup=${this.handlePointerUp}
               @pointercancel=${this.handlePointerCancel}
               @pointerleave=${this.handlePointerCancel}
               @pointerout=${this.handlePointerCancel}>
          </div>

          ${this.opts.showStatusText?m`
            <div class="status">
              ${this.statusLabel()}${this._locked?" (Locked)":""}
            </div>`:u}
        </div>

        <!-- ── Mouse buttons ── -->
        ${this.opts.showMouseButtons?m`
          <div class="mouse-bar">
            <button class="mouse-btn" title="Left click"  @click=${()=>this.sendTap("click")}>
              Left
            </button>
            <button class="mouse-btn" title="Right click" @click=${()=>this.sendTap("right_click")}>
              Right
            </button>
          </div>`:u}

        <!-- ── Media controls bar ── -->
        ${this.opts.showMediaControls?m`
          <div class="media-bar">
            <button class="media-btn" title="Previous"   @click=${()=>this.sendMedia("previous")}>
              <ha-icon icon="mdi:skip-previous"></ha-icon>
            </button>
            <button class="media-btn" title="Play / Pause" @click=${()=>this.sendMedia("play_pause")}>
              <ha-icon icon="mdi:play-pause"></ha-icon>
            </button>
            <button class="media-btn" title="Stop"       @click=${()=>this.sendMedia("stop")}>
              <ha-icon icon="mdi:stop"></ha-icon>
            </button>
            <button class="media-btn" title="Next"       @click=${()=>this.sendMedia("next")}>
              <ha-icon icon="mdi:skip-next"></ha-icon>
            </button>
          </div>`:u}

        <!-- ── Keyboard panel ── -->
        ${e?m`
          <div class="controls">
            <div class="left-panel">
              <input class="keyboard-input"
                     type="text"
                     inputmode="text"
                     autocomplete="off"
                     autocorrect="off"
                     autocapitalize="none"
                     spellcheck="false"
                     placeholder="Tap to type on PC"
                     @input=${this.handleKeyboardInput}
                     @keydown=${this.handleKeyboardKeydown} />
              ${r.map(o=>m`
                <button class="pill" @click=${()=>this.sendKey(o.key)}>${o.label}</button>`)}
            </div>
            <div class="right-panel">
              ${i.map(o=>m`
                <button class="pill arrow ${o.cls}"
                        @click=${()=>this.sendKey(o.key)}
                        title=${o.title}>
                  ${o.label}
                </button>`)}
            </div>
          </div>`:u}
      </ha-card>
    `}};g.styles=L`
    :host {
      display: block;
      --control-height: 36px;
      --arrow-size: var(--control-height);
      --arrow-gap: 8px;
      --arrow-cluster-width: calc(var(--arrow-size) * 3 + var(--arrow-gap) * 2);
    }

    ha-card { overflow: hidden; }

    /* ── Touchpad surface ── */
    .surface {
      position: relative;
      height: 280px;
      background: linear-gradient(135deg, #1f2736, #2a3347);
      border-radius: 12px;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
      color: #f5f5f5;
      user-select: none;
      touch-action: none;
    }

    .surface.with-keyboard {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }

    .surface.locked { touch-action: pan-y; }

    .capture {
      position: absolute;
      inset: 0;
      touch-action: none;
      z-index: 1;
    }

    /* ── Speed buttons ── */
    .speed-buttons {
      position: absolute;
      top: 10px;
      left: 14px;
      display: flex;
      gap: 8px;
      z-index: 2;
    }

    .speed {
      font-size: 12px;
      letter-spacing: 0.08em;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.18);
      color: #9ea7b7;
      padding: 6px 10px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 140ms ease;
    }

    .speed.active {
      color: #ff9800;
      border-color: rgba(255,152,0,0.5);
      box-shadow: 0 0 0 1px rgba(255,152,0,0.2);
    }

    /* ── Lock button ── */
    .lock {
      position: absolute;
      top: 10px;
      right: 14px;
      z-index: 2;
      font-size: 12px;
      letter-spacing: 0.12em;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.18);
      color: #9ea7b7;
      padding: 6px 10px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 140ms ease;
    }

    .lock.active {
      color: #ff9800;
      border-color: rgba(255,152,0,0.5);
      box-shadow: 0 0 0 1px rgba(255,152,0,0.2);
    }

    /* ── Side icon stacks (volume) ── */
    .side-stack {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 3;
    }

    .side-stack.right { right: 12px; }

    .icon-btn {
      width: 38px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.04);
      color: #e5ecff;
      cursor: pointer;
      font-size: 16px;
      transition: all 140ms ease;
    }

    .icon-btn:hover {
      border-color: rgba(255,255,255,0.32);
      background: rgba(255,255,255,0.12);
    }

    .icon-btn:active { transform: scale(0.96); }

    /* ── Keyboard toggle ── */
    .keyboard-toggle {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 3;
      width: 44px;
      height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.05);
      color: #9ea7b7;
      cursor: pointer;
      font-size: 17px;
      transition: all 140ms ease;
    }

    .keyboard-toggle:hover { border-color: rgba(255,255,255,0.32); color: #e5ecff; }

    .keyboard-toggle.active {
      color: #ff9800;
      border-color: rgba(255,152,0,0.5);
      box-shadow: 0 0 0 1px rgba(255,152,0,0.2);
    }

    .icon-btn ha-icon, .keyboard-toggle ha-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: inherit;
      --mdc-icon-size: 20px;
    }

    /* ── Status text ── */
    .status {
      position: absolute;
      left: 14px;
      bottom: 12px;
      font-size: 13px;
      color: rgba(255,255,255,0.7);
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      pointer-events: none;
    }

    /* ── Mouse buttons bar ── */
    .mouse-bar {
      display: flex;
      border-top: 1px solid rgba(255,255,255,0.06);
    }

    .mouse-btn {
      flex: 1;
      height: 38px;
      border: none;
      border-radius: 0;
      background: #12171f;
      color: #7a8494;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.06em;
      transition: background 120ms ease, color 120ms ease;
    }

    .mouse-btn:first-child {
      border-right: 1px solid rgba(255,255,255,0.08);
    }

    .mouse-btn:hover {
      background: rgba(255,255,255,0.07);
      color: #cdd4e0;
    }

    .mouse-btn:active {
      background: rgba(255,255,255,0.14);
      color: #fff;
    }

    /* ── Media controls bar ── */
    .media-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 14px;
      background: #161c29;
      border-top: 1px solid rgba(255,255,255,0.06);
    }

    .media-btn {
      width: 44px;
      height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.04);
      color: #e5ecff;
      cursor: pointer;
      transition: all 140ms ease;
    }

    .media-btn:hover {
      border-color: rgba(255,255,255,0.32);
      background: rgba(255,255,255,0.12);
    }

    .media-btn:active { transform: scale(0.94); }

    .media-btn ha-icon {
      width: 22px;
      height: 22px;
      color: inherit;
      --mdc-icon-size: 22px;
    }

    /* ── Keyboard panel ── */
    .controls {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 12px 14px 14px;
      background: #161c29;
      border-top: 1px solid rgba(255,255,255,0.06);
      border-bottom-left-radius: 12px;
      border-bottom-right-radius: 12px;
    }

    .left-panel {
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: flex-start;
    }

    .left-panel .keyboard-input {
      flex: 1 1 100%;
      min-width: 0;
      height: var(--control-height);
      box-sizing: border-box;
      padding: 0 10px;
    }

    .left-panel .pill { flex: 0 0 auto; height: var(--control-height); padding: 0 12px; }

    .right-panel {
      flex: 0 0 var(--arrow-cluster-width);
      display: grid;
      grid-template-columns: repeat(3, var(--arrow-size));
      grid-template-rows: repeat(2, var(--arrow-size));
      gap: var(--arrow-gap);
      justify-items: center;
      align-items: center;
      margin-left: 10px;
      align-self: flex-start;
    }

    .pill.arrow {
      width: var(--arrow-size);
      height: var(--arrow-size);
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }

    .arrow-up    { grid-column: 2; grid-row: 1; }
    .arrow-left  { grid-column: 1; grid-row: 2; }
    .arrow-down  { grid-column: 2; grid-row: 2; }
    .arrow-right { grid-column: 3; grid-row: 2; }

    .pill {
      padding: 8px 12px;
      font-size: 13px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.05);
      color: #e5ecff;
      cursor: pointer;
      transition: all 140ms ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .pill:hover { border-color: rgba(255,255,255,0.32); background: rgba(255,255,255,0.12); }

    .keyboard-input {
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
      color: #f5f5f5;
      font-size: 14px;
      outline: none;
    }

    .keyboard-input:focus {
      border-color: rgba(255,255,255,0.32);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.08);
    }
  `,f([M({attribute:!1})],g.prototype,"hass",2),f([v()],g.prototype,"_config",2),f([v()],g.prototype,"_status",2),f([v()],g.prototype,"_statusDisplay",2),f([v()],g.prototype,"_locked",2),f([v()],g.prototype,"_speedMultiplier",2),f([v()],g.prototype,"_keyboardOpen",2),g=f([W("unified-remote-card")],g);window.customCards=window.customCards||[];window.customCards.find(s=>s.type==="unified-remote-card")||window.customCards.push({type:"unified-remote-card",name:"Unified Remote Card",description:"Control your PC from Home Assistant \u2014 touchpad, media controls, keyboard, and volume via Unified Remote."});export{g as UnifiedRemoteCard};
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/lit-html.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-element/lit-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/custom-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/property.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/state.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/event-options.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/base.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-all.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-async.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-assigned-elements.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-assigned-nodes.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
