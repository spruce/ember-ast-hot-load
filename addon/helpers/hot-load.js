import Helper from "@ember/component/helper";
import { inject as service } from "@ember/service";
import { later, cancel } from "@ember/runloop";
import { capitalize, camelize } from "@ember/string";
import { getOwner } from "@ember/application";
import Component from "@ember/component";
import { computed } from "@ember/object";
import { compileTemplate } from "@ember/template-compilation";

export default Helper.extend({
  hotLoader: service(),

  init() {
    this._super(...arguments);
    this.hotLoader.on("willHotReload", this, "__rerenderOnTemplateUpdate");
    this.hotLoader.on("willLiveReload", this, "__willLiveReload");
    this.binded__rerenderOnTemplateUpdate = this.__rerenderOnTemplateUpdate.bind(
      this
    );
    this.binded__willLiveReload = this.__willLiveReload.bind(this);
    this.hotLoader.registerWillHotReload(this.binded__rerenderOnTemplateUpdate);
    this.hotLoader.registerWillLiveReload(this.binded__willLiveReload);
  },
  __rerenderOnTemplateUpdate(path) {
    if (this.hotLoader.isMatchingComponent(this.firstComputeName, path)) {
      this.hotLoader.forgetComponent(this.firstComputeName);
      cancel(this.timer);
      this.timer = later(() => {
        this.recompute();
      });
    }
  },
  __willLiveReload(event) {
    if (this.hotLoader.isMatchingComponent(this.firstComputeName, event.modulePath)) {
      event.cancel = true;
      if (!event.components.includes(this.firstComputeName)) {
        event.components.push(this.firstComputeName);
      }
      this.hotLoader.clearRequirejs(this.firstComputeName);
    }
  },
  willDestroy() {
    this._super(...arguments);
    cancel(this.timer);
    this.hotLoader.off("willHotReload", this, "__rerenderOnTemplateUpdate");
    this.hotLoader.off("willLiveReload", this, "__willLiveReload");
    this.hotLoader.unregisterWillHotReload(
      this.binded__rerenderOnTemplateUpdate
    );
    this.hotLoader.unregisterWillLiveReload(this.binded__willLiveReload);
  },
  dynamicComponentNameForHelperWrapper(name) {
    return `helper ${name}`;
	},
	renderDynamicComponentHalper() {
    return 'hot-content';
  },
  registerDynamicComponent(name) {
    if (this.hotLoader.hasDynamicHelperWrapperComponent(name)) {
      return;
    }
    this.printError(name);
    this.hotLoader.addDynamicHelperWrapperComponent(name);
    const owner = getOwner(this);
    const component = Component.extend({
      tagName: "",
      layout: computed(function() {
        let positionalParams = (this._params || []).join(" ");
        let attrs = this["attrs"] || {};
        const attributesMap = Object.keys(attrs)
          .filter(key => key !== "_params")
          .map(key => `${key}=${key}`)
          .join(" ");
        const tpl = `{{${name} ${positionalParams} ${attributesMap}}}`;
        return compileTemplate(tpl);
      })
    });
    component.reopenClass({
      positionalParams: "_params"
    });
    owner.application.register(
      `component:${this.dynamicComponentNameForHelperWrapper(name)}`,
      component
    );
  },
  printError(name) {
    window["console"].info(`

	Oops, looks like helper "${name}" invoked like component (due to 'ember-ast-hot-load' ast transformation).
	Don't worry it's expected behavour because helper "${name}" looks like component ( {{${name}}} or <${capitalize(
      camelize(name)
    )} />)

	to fix this issue, add "${name}" into "ember-cli-build.js" in application config section

	/////////////////////////////////////
	
	let app = new EmberApp(defaults, {
	  'ember-ast-hot-load': {
		  helpers: ["${name}"],
		  enabled: true
	  }
	});

	/////////////////////////////////////

  `);
    return "hot-placeholder";
  },
  compute([name, context = {}, maybePropertyValue = undefined]) {
		if ((name in context) || (typeof maybePropertyValue !== 'undefined')) {
      return this.renderDynamicComponentHalper(name, context, maybePropertyValue);
		}
    if (!this.hotLoader.isComponent(name)) {
      if (this.hotLoader.isHelper(name)) {
        this.registerDynamicComponent(name);
        return this.dynamicComponentNameForHelperWrapper(name);
      } else {
        this.renderDynamicComponentHalper(name, context, maybePropertyValue);
      }    
    }
    if (name === this.firstCompute) {
      this.firstCompute = false;
      this.timer = later(() => {
        this.recompute();
      });
      return "hot-placeholder";
    }
    if (!this.firstCompute) {
      this.firstCompute = name;
      this.firstComputeName = name;
    }

    if (this.firstComputeName !== name) {
      this.firstComputeName = name;
    }

    return name;
  }
});
