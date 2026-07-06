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
    var electron = require('electron');
    var Menu = electron.Menu || (electron.default && electron.default.Menu);
    if (Menu && typeof Menu.buildFromTemplate === 'function') {
      var orig = Menu.buildFromTemplate.bind(Menu);
      Menu.buildFromTemplate = function (template) {
        return orig(patchTemplate(template));
      };
    }
  } catch (e) {}
})();
${PATCH_END}
`
}
