import Ember from 'ember';

const { run, aliasMethod, guidFor, merge, inject: { service } } = Ember;

export default Ember.Service.extend({
  windowMessengerEvents: service(),

  callbacks: {},
  targets: {},

  init() {
    this._super(...arguments);
    this.get('windowMessengerEvents').on('from:ember-window-messenger-server', this, this.onMessage);
  },

  /**
   * Add new contentWindow target
   *
   * @param {String} name         String name of the target
   * @param {contentWindow} targetWindow DOM contentWindow
   * @public
   */

  addTarget(name, targetWindow) {
    this.targets[name] = targetWindow;
  },

  /**
   * Remove contentWindow target
   *
   * @param  {String} name
   * @public
   */

  removeTarget(name) {
    delete this.targets[name];
  },

  getWindow() {
    return window;
  },

  _parseURI(uri) {
    let split = uri.split(':');
    let resource = split[1] || split[0];
    return {
      target: split[1] ? split[0] : 'parent',
      resource: Ember.String.dasherize(resource)
    };
  },

  /**
   * Determine if resource target is parent or not
   *
   * @param  {String}  target
   * @private
   * @return {Boolean}
   */

  _isTargetParent(target) {
    let win = this.getWindow();
    let isEmbedded = win.self !== win.top || win.opener;
    return isEmbedded || target === 'parent';
  },

  _getWindowParent() {
    let win = this.getWindow();
    return win.opener || win.parent;
  },

  _targetFor(target) {
    return this._isTargetParent(target) ? this._getWindowParent() : this.targets[target];
  },

  _targetOriginFor(target) {
    return this.get(`targetOriginMap.${target}`);
  },

  fetch(path, queryParams) {
    let uri = this._parseURI(path);
    let targetName = uri.target;
    let queryObject = queryParams ? merge({}, queryParams) : {};

    let targetOrigin = this._targetOriginFor(targetName);
    Ember.assert(`Target origin for target: ${targetName} does not exist`, targetOrigin);

    let target = this._targetFor(targetName);
    Ember.assert(`Target window is not registered for: ${targetName}`, target);

    return new Ember.RSVP.Promise((resolve, reject) => {
      let uuid = guidFor(queryObject);
      let query = {
        id: uuid,
        type: 'ember-window-messenger-client',
        name: uri.resource,
        query: queryObject
      };

      this.callbacks[uuid] = {
        success: (json) => {
          run(null, resolve, json);
        },
        error: (json) => {
          run(null, reject, json);
        }
      };
      target.postMessage(JSON.stringify(query), targetOrigin);
    }, `ember-window-messenger: ${path}`);
  },

  /**
   * Alias to fetch method, for providing semantic sugar
   *
   * @public
   */
  rpc: aliasMethod('fetch'),

  onMessage(message) {
    let { response, id, error } = message;
    let inQueue = this.callbacks[id];

    if (Ember.typeOf(inQueue) === 'object') {
      if (error) {
        inQueue.error(response);
      } else {
        inQueue.success(response);
      }
    }
    delete this.callbacks[id];
  },

  willDestroy() {
    this._super(...arguments);
    this.get('windowMessengerEvents').off('from:ember-window-messenger-server', this, this.onMessage);
  }
});
