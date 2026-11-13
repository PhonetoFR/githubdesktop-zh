import { Dict } from './dict'
import { Rule } from './rules'

export const PATCH_START = '/*ZH-PATCH*/'
export const PATCH_END = '/*END-ZH-PATCH*/'

export function buildMenuPatch(dict: Dict, rules: Rule[] = []): string {
  const dictJson = JSON.stringify(dict)
  const rulesJson = JSON.stringify(
    rules.map(r => ({ pattern: r.pattern, flags: r.flags, replacement: r.replacement }))
  )
  return `${PATCH_START}
(() => {
  'use strict';
  var DICT = ${dictJson};
  var RULES = ${rulesJson}.map(function (r) {
    return { pattern: new RegExp(r.pattern, r.flags), replacement: r.replacement };
  });
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
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      if (r.pattern.test(stripped)) {
        return stripped.replace(r.pattern, r.replacement);
      }
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
