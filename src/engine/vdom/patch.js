// vdom diff 核心（游戏版，对标 Vue2 src/core/vdom/patch.js）。
// 职责：createPatchFunction —— 接收平台适配器 api（nodeOps），产出 patch(oldVnode, vnode)。
// 完整移植 Vue2 的 diff 算法：createElm / patchVnode / updateChildren（key 映射 + 双端比较）/
// 静态子树复用 / removeAndInvokeRemoveHook / invokeInsertHook（队列制）/ invokeDestroyHook。
// DOM-free：所有平台操作经 nodeOps 抽象（createElement/insertBefore/removeChild/...），
// 由 dom_host / gnode_host / mock host 实现。
import {
  VNode, isUndef, isDef, isTrue, isFalse, isPrimitive,
  sameVnode, createKeyToOldIdx, findIdxInOld, createEmptyVNode,
} from './vnode.js';
import { updateAllModules, updateRef } from './modules.js';

const emptyNode = new VNode('', {}, []);

// 平台钩子：insertedVnodeQueue（patch 完毕后统一 fire 'insert'）
export function createPatchFunction(backend) {
  const api = backend.api;                 // nodeOps
  const insertedVnodeQueue = [];           // 本 patch 周期内收集的 insert 钩子

  // ---- 创建真实节点（递归）----
  function createElm(vnode, parentElm, refElm, nested, ownerArray, index) {
    if (isTrue(vnode.isComment)) {
      vnode.elm = api.createComment(vnode.text);
      insert(parentElm, vnode.elm, refElm);
      return;
    }
    if (isDef(vnode.tag)) {
      vnode.elm = api.createElement(vnode.tag, vnode.data);
      setScope(vnode);
      if (isDef(vnode.children)) {
        for (let i = 0; i < vnode.children.length; ++i) {
          createElm(vnode.children[i], vnode.elm, null, true, vnode.children, i);
        }
      }
      if (isDef(vnode.text)) api.setTextContent(vnode.elm, vnode.text);
      invokeCreateHooks(vnode, insertedVnodeQueue);
      insert(parentElm, vnode.elm, refElm);
    } else if (isPrimitive(vnode.text)) {
      vnode.elm = api.createTextNode(vnode.text);
      insert(parentElm, vnode.elm, refElm);
    }
  }

  function setScope(vnode) {
    // 游戏版无 scoped slot / CSS scope；仅记录父链供 ref/insert 用
    let i = vnode.parent;
    while (i) {
      if (isDef(i = i.parent)) i.fnScopeId = i.fnScopeId; // no-op，保持结构
      break;
    }
  }

  function invokeCreateHooks(vnode, queue) {
    const data = vnode.data;
    if (isDef(data)) {
      const hook = data.hook;
      if (isDef(hook) && isDef(hook.create)) hook.create(emptyNode, vnode);
      if (isDef(hook) && isDef(hook.insert)) queue.push(vnode);
    }
    updateAllModules(vnode, emptyNode, api);
  }

  function insert(parent, elm, ref) {
    if (isDef(parent)) {
      if (isDef(ref)) {
        if (api.parentNode(ref) === parent) api.insertBefore(parent, elm, ref);
      } else {
        api.appendChild(parent, elm);
      }
    }
  }

  function parentElm(vnode) {
    let cur = vnode;
    while (cur) {
      if (isDef(cur.elm)) return cur.elm;
      cur = cur.parent;
    }
    return undefined;
  }

  function refElm(vnode, nested) {
    // 取「下一个兄弟节点」作为插入锚点：在 ownerArray 中找该 vnode 之后的第一个真实节点
    if (isTrue(nested)) return undefined;
    let i = vnode.ownerArray ? vnode.ownerArray.indexOf(vnode) + 1 : -1;
    while (i > 0 && i < vnode.ownerArray.length) {
      const n = vnode.ownerArray[i];
      if (isDef(n.elm)) return n.elm;
      i++;
    }
    return undefined;
  }

  // ---- 主 patch：oldVnode ↔ vnode 或（真实节点 → 首次挂载）----
  function patch(oldVnode, vnode, hydrating, removeOnly) {
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode);
      return undefined;
    }
    let isInitialPatch = false;
    if (isUndef(oldVnode)) {
      // 空挂载：父级为空字符串，createElm 到空容器
      isInitialPatch = true;
      vnode.parent = undefined;
      createElm(vnode, api.createElement('__root__'), null, false);
      invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch);
      return vnode.elm;
    }
    const isRealElement = isDef(oldVnode.nodeType);
    if (!isRealElement && sameVnode(oldVnode, vnode)) {
      patchVnode(oldVnode, vnode, insertedVnodeQueue, removeOnly);
      return vnode.elm;
    }
    if (isRealElement) {
      // 真实节点 → 虚拟节点（首次挂载）
      oldVnode = emptyNodeAt(oldVnode);
    }
    const oldElm = oldVnode.elm;
    const parent = api.parentNode(oldElm);
    vnode.parent = oldVnode.parent;
    createElm(vnode, parent, api.nextSibling(oldElm), false);
    if (isDef(parent)) removeVnodes([oldVnode], 0, 0);
    invokeInsertHook(vnode, insertedVnodeQueue, false);
    return vnode.elm;
  }

  function emptyNodeAt(elm) {
    return new VNode(api.tagName(elm).toLowerCase(), {}, [], undefined, elm);
  }

  // ---- 更新既有节点 ----
  function patchVnode(oldVnode, vnode, insertedVnodeQueue, removeOnly) {
    if (oldVnode === vnode) return;
    const elm = vnode.elm = oldVnode.elm;
    vnode.data = vnode.data || {};
    vnode.data.__oldAttrs = oldVnode.data ? oldVnode.data.__oldAttrs : undefined;
    vnode.data.__oldProps = oldVnode.data ? oldVnode.data.__oldProps : undefined;
    vnode.data.__oldClass = oldVnode.data ? oldVnode.data.__oldClass : undefined;
    vnode.data.__oldStyle = oldVnode.data ? oldVnode.data.__oldStyle : undefined;
    vnode.data.__oldOn = oldVnode.data ? oldVnode.data.__oldOn : undefined;
    vnode.data.__oldDirs = oldVnode.data ? oldVnode.data.__oldDirs : undefined;

    const oldCh = oldVnode.children;
    const ch = vnode.children;
    if (isDef(vnode.data) && isDef(vnode.data.hook) && isDef(vnode.data.hook.prepatch)) {
      vnode.data.hook.prepatch(oldVnode, vnode);
    }

    // 静态子树直接复用（isStatic + key 相同 → 跳过 diff）
    if (isTrue(vnode.isStatic) && isTrue(oldVnode.isStatic) && vnode.key === oldVnode.key) {
      vnode.isCloned = true;
      invokeStaticHooks(oldVnode, vnode);
      return;
    }

    updateAllModules(vnode, oldVnode, api);

    if (isUndef(vnode.text)) {
      if (isDef(oldCh) && isDef(ch)) {
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly);
      } else if (isDef(ch)) {
        if (isDef(oldVnode.text)) api.setTextContent(elm, '');
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue);
      } else if (isDef(oldCh)) {
        removeVnodes(oldCh, 0, oldCh.length - 1);
      } else if (isDef(oldVnode.text)) {
        api.setTextContent(elm, '');
      }
    } else if (oldVnode.text !== vnode.text) {
      api.setTextContent(elm, vnode.text);
    }

    if (isDef(vnode.data) && isDef(vnode.data.hook) && isDef(vnode.data.hook.postpatch)) {
      vnode.data.hook.postpatch(oldVnode, vnode);
    }
  }

  function invokeStaticHooks(oldVnode, vnode) {
    vnode.elm = oldVnode.elm;
    vnode.componentInstance = oldVnode.componentInstance;
    if (isDef(vnode.children)) vnode.children.forEach(c => { c.isCloned = true; });
  }

  function invokeInsertHook(vnode, queue, initial) {
    if (isTrue(initial) && isDef(vnode.parent)) {
      vnode.parent.data.pendingInsert = queue;
    } else {
      for (let i = 0; i < queue.length; ++i) {
        queue[i].data.hook.insert(queue[i]);
      }
    }
  }

  function invokeDestroyHook(vnode) {
    const data = vnode.data;
    if (isDef(data)) {
      if (isDef(data.hook) && isDef(data.hook.destroy)) data.hook.destroy(vnode);
    }
    if (isDef(vnode.children)) {
      for (let i = 0; i < vnode.children.length; ++i) invokeDestroyHook(vnode.children[i]);
    }
    // ref 解绑
    if (isDef(data) && isDef(data.ref)) updateRef(vnode, api, true);
  }

  // ---- 子节点增删 ----
  function addVnodes(parentElm2, refElm2, vnodes, startIdx, endIdx, insertedVnodeQueue2) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(vnodes[startIdx], parentElm2, refElm2, false, vnodes, startIdx);
    }
  }

  function removeVnodes(vnodes, startIdx, endIdx) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx];
      if (isDef(ch)) {
        if (isDef(ch.tag)) {
          removeAndInvokeRemoveHook(ch);
          invokeDestroyHook(ch);
        } else {
          removeNode(ch.elm);
        }
      }
    }
  }

  function removeAndInvokeRemoveHook(vnode, rm) {
    const el = vnode.elm;
    if (isDef(vnode.data) && isDef(vnode.data.hook) && isDef(vnode.data.hook.remove)) {
      vnode.data.hook.remove(vnode, () => removeNode(el));
    } else {
      removeNode(el);
    }
  }

  function removeNode(el) {
    const parent = api.parentNode(el);
    if (isDef(parent)) api.removeChild(parent, el);
  }

  // ---- 核心：updateChildren（双端比较 + key 映射）----
  function updateChildren(parentElm2, oldCh, newCh, insertedVnodeQueue2, removeOnly) {
    let oldStartIdx = 0;
    let newStartIdx = 0;
    let oldEndIdx = oldCh.length - 1;
    let oldStartVnode = oldCh[0];
    let oldEndVnode = oldCh[oldEndIdx];
    let newEndIdx = newCh.length - 1;
    let newStartVnode = newCh[0];
    let newEndVnode = newCh[newEndIdx];
    let oldKeyToIdx, idxInOld, vnodeToMove, refElm2;

    const canMove = !removeOnly;

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (isUndef(oldStartVnode)) {
        oldStartVnode = oldCh[++oldStartIdx];
      } else if (isUndef(oldEndVnode)) {
        oldEndVnode = oldCh[--oldEndIdx];
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue2, removeOnly);
        oldStartVnode = oldCh[++oldStartIdx];
        newStartVnode = newCh[++newStartIdx];
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue2, removeOnly);
        oldEndVnode = oldCh[--oldEndIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldStartVnode, newEndVnode)) {
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue2, removeOnly);
        canMove && api.insertBefore(parentElm2, oldStartVnode.elm, api.nextSibling(oldEndVnode.elm));
        oldStartVnode = oldCh[++oldStartIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldEndVnode, newStartVnode)) {
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue2, removeOnly);
        canMove && api.insertBefore(parentElm2, oldEndVnode.elm, oldStartVnode.elm);
        oldEndVnode = oldCh[--oldEndIdx];
        newStartVnode = newCh[++newStartIdx];
      } else {
        if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
        idxInOld = isDef(newStartVnode.key)
          ? oldKeyToIdx[newStartVnode.key]
          : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx);
        if (isUndef(idxInOld)) {
          createElm(newStartVnode, parentElm2, refElm2 = oldStartVnode.elm, false, newCh, newStartIdx);
        } else {
          vnodeToMove = oldCh[idxInOld];
          if (sameVnode(vnodeToMove, newStartVnode)) {
            patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue2, removeOnly);
            oldCh[idxInOld] = undefined;
            canMove && api.insertBefore(parentElm2, vnodeToMove.elm, oldStartVnode.elm);
          } else {
            createElm(newStartVnode, parentElm2, refElm2 = oldStartVnode.elm, false, newCh, newStartIdx);
          }
        }
        newStartVnode = newCh[++newStartIdx];
      }
    }
    if (oldStartIdx > oldEndIdx) {
      refElm2 = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm;
      addVnodes(parentElm2, refElm2, newCh, newStartIdx, newEndIdx, insertedVnodeQueue2);
    } else if (newStartIdx > newEndIdx) {
      removeVnodes(oldCh, oldStartIdx, oldEndIdx);
    }
  }

  return function (oldVnode, vnode, hydrating, removeOnly) {
    return patch(oldVnode, vnode, hydrating, removeOnly);
  };
}
