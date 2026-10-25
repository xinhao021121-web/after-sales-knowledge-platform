export function isMultiObjectiveQuestion(question) {
  return /分别|还是|各自|两种业务|多条路径/.test(String(question || ""));
}
