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
    var leadMatch = text.match(/^\s*/);
    var trailMatch = text.match(/\s*$/);
    var lead = leadMatch ? leadMatch[0] : '';
    var trail = trailMatch ? trailMatch[0] : '';
    var trimmed = text.trim();
    if (trimmed === '') return text;
    if (CJK.test(trimmed)) return text;
    var result = null;
    if (Object.prototype.hasOwnProperty.call(DICT, trimmed)) {
      result = DICT[trimmed];
    } else {
      for (var i = 0; i < RULES.length; i++) {
        var r = RULES[i];
        var m = r.pattern.exec(trimmed);
        if (m) { result = trimmed.replace(r.pattern, r.replacement); break; }
      }
    }
    if (result === null) return text;
    return lead + result + trail;
  }

  function translateTextNode(node) {
    var original = node.nodeValue;
    if (!original) return;
    var translated = translate(original);
    if (translated !== original) {
      node.nodeValue = translated;
      return;
    }
    var next = node.nextSibling;
    if (next && next.nodeType === 3 && next.nodeValue) {
      var after = next.nextSibling;
      if (after && after.nodeType === 3 && after.nodeValue) {
        var triple = original + next.nodeValue + after.nodeValue;
        var tripleTranslated = translate(triple);
        if (tripleTranslated !== triple) {
          node.nodeValue = tripleTranslated;
          next.nodeValue = '';
          after.nodeValue = '';
          return;
        }
      }
      var combined = original + next.nodeValue;
      var combinedTranslated = translate(combined);
      if (combinedTranslated !== combined) {
        node.nodeValue = combinedTranslated;
        next.nodeValue = '';
      }
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
    var hasElementChild = false;
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1) { hasElementChild = true; break; }
    }
    if (hasElementChild) return;
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
  var nextPending = null;
  function schedule(node) {
    var bucket = isApplying ? nextPending : pending;
    if (!bucket) {
      bucket = [];
      if (isApplying) nextPending = bucket;
      else pending = bucket;
    }
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) bucket.push(node[i]);
    } else {
      bucket.push(node);
    }
    if (isApplying) return;
    Promise.resolve().then(function () {
      if (!pending) {
        if (nextPending) {
          pending = nextPending;
          nextPending = null;
        } else {
          return;
        }
      }
      var nodes = pending;
      pending = null;
      isApplying = true;
      try {
        for (var i = 0; i < nodes.length; i++) {
          walk(nodes[i]);
        }
      } finally {
        isApplying = false;
        if (nextPending) {
          var np = nextPending;
          nextPending = null;
          schedule(np);
        }
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
