import { publishGlobal, signRealtimeToken } from '@forge/realtime';
import { kvs } from '@forge/kvs';
import { issueSearch } from './apiCalls';
import {
    getStoryPointsKey,
    scoreIssue,
    SCORING_CONFIG_KEY,
    DEFAULT_SCORING_CONFIG,
    ScoringConfig,
    getTransitionLabel,
} from './helpers';
import { PublishEventOptions, ActivityEntry } from './types';

/**
 * Trigger handler invoked by Atlassian whenever a Jira issue event fires.
 * Configured as the trigger module in manifest.yml.
 *
 * Filters to only "issue_generic" events (Atlassian sends both "issue_generic"
 * and "issue_updated" per update — we process only one to avoid duplicate
 * notifications; see the commented-out console.log for raw event inspection).
 *
 * On a matching event:
 *  1. Extracts issue metadata (key, assignee, type, transition state).
 *  2. Fetches full issue details to resolve the story-points custom field key.
 *  3. Scores the issue (defaults to 1 if no story points are set).
 *  4. Publishes a realtime event to the frontend via `publishEvent`.
 *
 * TODO: simplify logic below... right now this function makes additional calls
 *       to provide a notification to the frontend.
 *
 * @param event   - The Jira webhook event payload forwarded by the trigger module.
 * @param context - The Forge invocation context (app/environment metadata).
 */
export const run = async (event: Record<string, any>, context: Record<string, any>) => {
    if (event.jiraEventTypeName == 'issue_generic') {
        try {
            // Extract display fields from the event payload
            const issueKey = event.issue.key;
            const user = event.issue.fields.assignee.accountId;
            const issueType = event.issue.fields.issuetype.name;

            // projectKey is used to scope the realtime token to this project (custom claims auth)
            const projectKey = event.issue.fields.project.key;

            // Find the status-change item in the changelog (other field changes are ignored)
            const statusChange = event.changelog.items.find(
                (item: Record<string, any>) => item.field === 'status',
            );

            if (!statusChange) return;

            const fromStatus = statusChange.fromString as string;
            const toStatus = statusChange.toString as string;

            const transition = getTransitionLabel(fromStatus, toStatus);

            // Fetch the full issue details and scoring config in parallel
            const [fullIssueDetails, savedConfig] = await Promise.all([
                issueSearch(`issueKey=${issueKey}`),
                kvs.get(SCORING_CONFIG_KEY),
            ]);
            const scoringConfig = (savedConfig ?? DEFAULT_SCORING_CONFIG) as ScoringConfig;
            const SPKey = getStoryPointsKey(fullIssueDetails.names);
            const points = scoreIssue(fullIssueDetails.issues[0], SPKey, scoringConfig);

            const eventPayload: ActivityEntry = {
                user,
                points,
                issueKey,
                issueType,
                transition,
            };

            const eventOptions: PublishEventOptions = {
                channel: 'issue-updated',
                projectKey: projectKey,
                payload: eventPayload,
            };

            return publishEvent(eventOptions);
        } catch (err) {
            console.error('Error processing event:', err);
            return;
        }
    }
    return;
};

/**
 * Signs a project-scoped realtime token and publishes an event
 * to all frontend subscribers on the given channel.
 *
 * Adapted from the Atlassian Forge Realtime tutorial:
 * https://bitbucket.org/atlassian/forge-presentations/src/main/00.forge-app-jam/Ep3_Realtime_Notifications/src/frontend/background-script.jsx
 *
 * The token is scoped to a specific `projectKey` via custom claims so that
 * frontends only receive events belonging to their own project's leaderboard.
 */
export const publishEvent = async (
    options: PublishEventOptions,
): Promise<Record<string, boolean>> => {
    try {
        // Scope the token to the current project so other projects' events are ignored
        const { channel, projectKey, payload } = options;
        const customClaims = { projectKey: projectKey };

        const tokenResult = await signRealtimeToken(channel, customClaims);

        if (tokenResult.errors?.length) {
            console.error('Error signing realtime token:', tokenResult.errors);
            return { success: false };
        }

        if (!tokenResult.token) {
            console.error('signRealtimeToken did not return a token');
            return { success: false };
        }

        // Broadcast the event payload to all frontend listeners on this channel
        const publishResponse = await publishGlobal(channel, payload, { token: tokenResult.token });

        if (publishResponse.errors) {
            console.error('Publish response has errors: ', publishResponse.errors);
            return { success: false };
        }

        return { success: true };
    } catch (err) {
        console.error('Error in publishEvent function event: ', err);
        return { success: false };
    }
};
