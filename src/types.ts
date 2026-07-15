export interface JiraIssue {
    id: string;
    key: string;
    fields: IssueFields;
    changelog?: Changelog;
}

export interface ChangelogItem {
    field: string;
    fromString: string;
    toString: string;
}

export interface ChangelogHistory {
    items: ChangelogItem[];
}

export interface Changelog {
    histories: ChangelogHistory[];
}

export interface IssueFields {
    issuetype?: {
        name: string;
    };
    summary?: string;
    reporter?: {
        accountId: string;
    } | null;
    statuscategorychangedate?: string;
    assignee?: {
        accountId: string;
    } | null;
    status?: {
        name: string;
    } | null;
    priority?: {
        name: string;
    } | null;
    [key: string]: unknown;
}

export interface JiraUser {
    accountId: string;
    displayName: string;
}

export interface JiraIssueSearchResponse {
    isLast: boolean;
    issues: JiraIssue[];
    names: Record<string, string>;
    nextPageToken?: string;
}

export enum JQLStatus {
    Done = 'Done',
    InProgress = 'In Progress',
}

export type IssueEventTransition =
    | 'doneFromProgress'
    | 'doneFromOther'
    | 'progressFromDone'
    | 'otherFromDone'
    | 'progressFromOther'
    | 'otherFromProgress'
    | 'none';

export type ActivityEntry = {
    user: string;
    points: number;
    issueKey: string;
    issueType: string;
    transition: IssueEventTransition;
};

export type StatsTableEntry = {
    key: string;
    reporter: string;
    type: string;
    summary: string;
    points: number;
};

export type IssueSearchFilters = {
    sprint?: string;
    startDate?: string;
    endDate?: string;
    issueTypes?: string[];
    priorities?: string[];
};

export type SavedFilter = {
    filter: IssueSearchFilters;
    filterId: string;
    filterName: string;
};

export type GetTokenResponse = {
    token: string | null;
};

export type AdminCheckResult = {
    isAdmin: boolean;
};

export type CompatibilityResult =
    | {
          isCompatible: true;
      }
    | {
          isCompatible: false;
          reason: 'no_story_points' | 'no_sprint_field';
      };

export type JiraBoard = {
    id: string;
};

export type JiraSprint = {
    name: string;
};

export type Sprint = {
    label: string;
    value: string;
};

export type UserParticipationStatus = {
    accountId: string;
    displayName: string;
    isParticipating: boolean;
};

export type LeaderboardEntry = {
    accountId: string;
    points: number;
    issuesCompleted: number;
    issuesInProgress: number;
};

export type LeaderboardRequestPayload = {
    filters?: IssueSearchFilters;
    status?: JQLStatus;
};

export type TokenRequestPayload = {
    channel: string;
};

export type ParticipationRequestPayload = {
    isParticipating: boolean;
};

export type SaveFilterRequestPayload = {
    filters: IssueSearchFilters;
    filterName: string;
};

export type ParticipationEventPayload = {
    accountId: string;
    isParticipating: boolean;
};

export type PublishEventOptions = {
    channel: string;
    projectKey: string;
    payload: ActivityEntry | ParticipationEventPayload;
};
