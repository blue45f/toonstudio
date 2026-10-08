'use strict';

const utils = require('./utils');

module.exports = (ast, options = {}) => {
  // ToonStudio 보안 포크: depth는 루트(0)부터 센 컨테이너 중첩 깊이다.
  const stringify = (node, parent = {}, depth = 0) => {
    const invalidBlock = options.escapeInvalid && utils.isInvalidBrace(parent);
    const invalidNode = node.invalid === true && options.escapeInvalid === true;
    let output = '';

    if (node.value) {
      if ((invalidBlock || invalidNode) && utils.isOpenOrClose(node)) {
        return '\\' + node.value;
      }
      return node.value;
    }

    if (node.value) {
      return node.value;
    }

    if (node.nodes) {
      // ToonStudio 보안 포크: 직접 넘긴 AST도 재귀 전에 깊이를 제한한다.
      // 부모는 업스트림과 같이 빈 객체로 넘겨 escapeInvalid 판정을 바꾸지 않는다.
      utils.assertDepth(depth);
      for (const child of node.nodes) {
        output += stringify(child, {}, depth + 1);
      }
    }
    return output;
  };

  return stringify(ast);
};

