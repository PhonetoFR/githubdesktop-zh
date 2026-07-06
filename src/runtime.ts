import { Dict } from './dict'

const HEADER = `/* GitHub Desktop 汉化运行时 - 由 github-desktop-zh 自动生成，请勿手动编辑 */`

export function buildRuntime(dict: Dict): string {
  const dictJson = JSON.stringify(dict)
  return `${HEADER}
(() => {
  'use strict';
  var DICT = ${dictJson};
  var RULES = [];
  var CJK = /[\\u4e00-\\u9fff]/;
  var ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];

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
      }
    }
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
    var container = document.getElementById('desktop-app-container');
    if (!container) {
      document.addEventListener('DOMContentLoaded', start, { once: true });
      return;
    }
    walk(container);
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
    mo.observe(container, { childList: true, subtree: true });
  }

  start();
})();
`
}
