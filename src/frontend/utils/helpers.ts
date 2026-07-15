//gets glyph type (only supports bug, story, default task currently)
export const getGlyph = (issueType: string): string => {
  if (issueType == 'Bug' || issueType == 'Story') {
    return issueType.toLowerCase();
  } else {
    return 'task';
  }
};

export const getUpdateDescription = (transition: string): string => {
  if (transition == 'progressFromDone') {
    return 'moved from Done -> In Progress. Lost';
  } else if (transition == 'progressFromOther') {
    return 'moved from To Do -> In Progress. Worth';
  } else if (transition == 'doneFromProgress') {
    return 'moved from In Progress -> Done. Awarded';
  } else if (transition == 'doneFromOther') {
    return 'moved from To Do -> Done. Awarded';
  } else if (transition == 'otherFromProgress') {
    return 'moved from In Progress -> To Do. Worth';
  } else if (transition == 'otherFromDone') {
    return 'moved from Done -> To Do. Lost';
  } else {
    return 'updated.';
  }
};
