export function resolveCitationMarker(marker, resources) {
  if (/^\d+$/.test(marker)) {
    const index = Number(marker);
    return index >= 1 && index <= resources.length;
  }
  return resources.some(resource => String(resource.content || "").includes(marker));
}

export function applyCitationGate({citationRequired, citationTraceable, answerStatus}) {
  if (citationRequired && !citationTraceable) {
    return {
      answerStatus: "NEEDS_CLARIFICATION",
      forcedDowngrade: true
    };
  }
  return {
    answerStatus,
    forcedDowngrade: false
  };
}
