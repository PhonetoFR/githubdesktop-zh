import { Dict } from './dict'
import { Rule } from './rules'

const HEADER = `/* GitHub Desktop 汉化运行时 - 由 github-desktop-zh 自动生成，请勿手动编辑 */`

export function buildRuntime(dict: Dict, rules: Rule[] = []): string {
  const dictJson = JSON.stringify(dict)
  const rulesJson = JSON.stringify(
    rules.map(r => ({ pattern: r.pattern, flags: r.flags, replacement: r.replacement }))
  )
  return `${HEADER}
(() => {
  'use strict';
  var DICT = ${dictJson};
  var RULES = ${rulesJson}.map(function (r) {
    return { pattern: new RegExp(r.pattern, r.flags), replacement: r.replacement };
  });
  var CJK = /[\\u4e00-\\u9fff]/;
  var ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  var SKIP_TAGS = ['SCRIPT','STYLE','SVG','CODE','PRE','TEXTAREA','INPUT','CANVAS','VIDEO','AUDIO','IFRAME','OBJECT','EMBED','NOSCRIPT'];

  function translate(text) {
    if (!text) return text;
    var trimmed = text.trim();
    if (trimmed === '') return text;
    if (CJK.test(trimmed)) return text;
    if (Object.prototype.hasOwnProperty.call(DICT, trimmed)) {
      return DICT[trimmed];
    }
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      var m = r.pattern.exec(trimmed);
      if (m) return trimmed.replace(r.pattern, r.replacement);
    }
    return text;
  }

  function translateTextNode(node) {
    var original = node.nodeValue;
    if (!original) return;
    var translated = translate(original);
    if (translated !== original) {
      node.nodeValue = translated;
    }
  }

  function translateAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var attr = ATTRS[i];
      var val = el.getAttribute(attr);
      if (val) {
        var translated = translate(val);
        if (translated !== val) el.setAttribute(attr, translated);
      }
    }
  }

  function isSkipTag(el) {
    if (!el || el.nodeType !== 1) return true;
    var tag = el.tagName;
    for (var i = 0; i < SKIP_TAGS.length; i++) {
      if (tag === SKIP_TAGS[i]) return true;
    }
    return false;
  }

  function tryTranslateContainer(el) {
    if (isSkipTag(el)) return;
    var txt = el.textContent;
    if (!txt) return;
    var trimmed = txt.trim();
    if (trimmed === '' || CJK.test(trimmed)) return;
    if (trimmed.length < 4 || trimmed.length > 200) return;
    var translated = translate(trimmed);
    if (translated !== trimmed) {
      el.textContent = translated;
    }
  }

  function walk(root) {
    if (!root) return;
    try {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      while (walker.nextNode()) {
        translateTextNode(walker.currentNode);
      }
    } catch (e) {}
    if (root.nodeType === 1) {
      translateAttrs(root);
    }
    if (root.querySelectorAll) {
      var els = root.querySelectorAll('*');
      for (var i = 0; i < els.length; i++) {
        translateAttrs(els[i]);
        tryTranslateContainer(els[i]);
      }
    }
    tryTranslateContainer(root);
  }

  var isApplying = false;
  var pending = null;
  function schedule(node) {
    if (isApplying) return;
    if (pending) {
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) pending.push(node[i]);
      } else {
        pending.push(node);
      }
      return;
    }
    pending = Array.isArray(node) ? node.slice() : [node];
    Promise.resolve().then(function () {
      if (!pending) return;
      var nodes = pending;
      pending = null;
      isApplying = true;
      try {
        for (var i = 0; i < nodes.length; i++) {
          walk(nodes[i]);
        }
      } finally {
        isApplying = false;
      }
    });
  }

  function start() {
    var target = document.body;
    if (!target) {
      document.addEventListener('DOMContentLoaded', start, { once: true });
      return;
    }
    walk(target);
    var mo = new MutationObserver(function (muts) {
      var added = [];
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          added.push(m.addedNodes[j]);
        }
      }
      if (added.length > 0) schedule(added);
    });
    mo.observe(target, { childList: true, subtree: true });
  }

  start();
})();
`
}
