import { Dict } from './dict'

export const PATCH_START = '/*ZH-PATCH*/'
export const PATCH_END = '/*END-ZH-PATCH*/'

export function buildMenuPatch(dict: Dict): string {
  const dictJson = JSON.stringify(dict)
  return `${PATCH_START}
(() => {
  'use strict';
  var DICT = ${dictJson};
  var CJK = /[\\u4e00-\\u9fff]/;
  function stripAccessKey(label) {
    if (!label) return label;
    return label.replace(/&([^&])/g, '$1');
  }
  function translateLabel(label) {
    if (!label) return label;
    var stripped = stripAccessKey(label);
    if (CJK.test(stripped)) return stripped;
    if (Object.prototype.hasOwnProperty.call(DICT, stripped)) {
      return DICT[stripped];
    }
    return stripped;
  }
  function patchTemplate(template) {
    if (!Array.isArray(template)) return template;
    return template.map(function (item) {
      if (!item || typeof item !== 'object') return item;
      var patched = Object.assign({}, item);
      if (patched.label) patched.label = translateLabel(patched.label);
      if (Array.isArray(patched.submenu)) {
        patched.submenu = patchTemplate(patched.submenu);
      }
      return patched;
    });
  }
  try {
    var Module = require('module');
    var origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      var mod = origLoad.apply(this, arguments);
      try {
        if (request === 'electron' && mod && mod.Menu && typeof mod.Menu.buildFromTemplate === 'function' && !mod.Menu.__zhPatched) {
          var orig = mod.Menu.buildFromTemplate.bind(mod.Menu);
          mod.Menu.buildFromTemplate = function (template) {
            return orig(patchTemplate(template));
          };
          mod.Menu.__zhPatched = true;
        }
      } catch (e) {}
      return mod;
    };
  } catch (e) {}
})();
${PATCH_END}
`
}
