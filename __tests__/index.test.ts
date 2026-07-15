import { run, publishEvent } from "../src/index";
import { issueSearch } from "../src/apiCalls";
import { signRealtimeToken, publishGlobal } from "@forge/realtime";
import { kvs } from "@forge/kvs";
import { PublishEventOptions } from "../src/types";

jest.mock("@forge/realtime", () => ({
    signRealtimeToken: jest.fn(),
    publishGlobal: jest.fn(),
}));

jest.mock("@forge/kvs", () => ({
    kvs: { get: jest.fn() },
}));

jest.mock("../src/apiCalls", () => ({
    issueSearch: jest.fn(),
}));

const mockSignRealtimeToken = signRealtimeToken as jest.Mock;
const mockPublishGlobal = publishGlobal as jest.Mock;
const mockIssueSearch = issueSearch as jest.Mock;
const mockKvsGet = kvs.get as jest.Mock;

beforeEach(() => {
    mockSignRealtimeToken.mockReset();
    mockPublishGlobal.mockReset();
    mockIssueSearch.mockReset();
    mockKvsGet.mockReset();
});

const createEvent = (statusFrom = "In Progress", statusTo = "Done") => ({
    jiraEventTypeName: "issue_generic",
    issue: {
        key: "TEST-1",
        fields: {
            assignee: { accountId: "user1" },
            issuetype: { name: "Story" },
            project: { key: "TEST" },
        },
    },
    changelog: {
        items: [
            { field: "status", fromString: statusFrom, toString: statusTo },
        ],
    },
});

const makeSearchResponse = () => ({
    isLast: true,
    issues: [
        {
            id: "1",
            key: "TEST-1",
            fields: { priority: { name: "Medium" }, customfield_10016: 3 },
        },
    ],
    names: { customfield_10016: "Story point estimate" },
});

const makePublishOptions = (
    overrides: Partial<PublishEventOptions> = {},
): PublishEventOptions => ({
    channel: "issue-updated",
    projectKey: "TEST",
    payload: {
        user: "user1",
        points: 5,
        issueKey: "TEST-1",
        issueType: "Story",
        transition: "doneFromProgress",
    },
    ...overrides,
});

describe("run", () => {
    it("returns undefined if event name not issue_generic", async () => {
        const result = await run({ jiraEventTypeName: "issue_updated" }, {});
        expect(result).toBeUndefined();
        expect(mockIssueSearch).not.toHaveBeenCalled();
    });

    it("returns undefined when changelog has no status change", async () => {
        const event = {
            ...createEvent(),
            changelog: {
                items: [
                    { field: "summary", fromString: "old", toString: "new" },
                ],
            },
        };
        const result = await run(event, {});
        expect(result).toBeUndefined();
        expect(mockIssueSearch).not.toHaveBeenCalled();
    });

    it("processes a valid event", async () => {
        mockIssueSearch.mockResolvedValue(makeSearchResponse());
        mockKvsGet.mockResolvedValue(null);
        mockSignRealtimeToken.mockResolvedValue({
            token: "mock-token",
            errors: [],
        });
        mockPublishGlobal.mockResolvedValue({});

        await run(createEvent(), {});

        expect(mockIssueSearch).toHaveBeenCalledWith("issueKey=TEST-1");
        expect(mockSignRealtimeToken).toHaveBeenCalledWith("issue-updated", {
            projectKey: "TEST",
        });
        expect(mockPublishGlobal).toHaveBeenCalled();
    });

    it("uses default scoring config when none is stored in KVS", async () => {
        mockIssueSearch.mockResolvedValue(makeSearchResponse());
        mockKvsGet.mockResolvedValue(null);
        mockSignRealtimeToken.mockResolvedValue({
            token: "mock-token",
            errors: [],
        });
        mockPublishGlobal.mockResolvedValue({});

        await run(createEvent(), {});

        expect(mockPublishGlobal).toHaveBeenCalled();
    });

    it("uses saved scoring config from KVS when available", async () => {
        const customConfig = { priorityMultipliers: { Medium: 10.0 } };
        mockIssueSearch.mockResolvedValue(makeSearchResponse());
        mockKvsGet.mockResolvedValue(customConfig);
        mockSignRealtimeToken.mockResolvedValue({
            token: "mock-token",
            errors: [],
        });
        mockPublishGlobal.mockResolvedValue({});

        await run(createEvent(), {});

        const publishedPayload = mockPublishGlobal.mock.calls[0][1];

        expect(publishedPayload.points).toBe(40);
    });

    it("returns undefined and does not throw when issueSearch fails", async () => {
        mockIssueSearch.mockRejectedValue(new Error("API error"));
        mockKvsGet.mockResolvedValue(null);

        const result = await run(createEvent(), {});
        expect(result).toBeUndefined();
    });
});

describe("publishEvent", () => {
    it("returns success: true when token is valid and publish succeeds", async () => {
        mockSignRealtimeToken.mockResolvedValue({
            token: "mock-token",
            errors: [],
        });
        mockPublishGlobal.mockResolvedValue({});

        const result = await publishEvent(makePublishOptions());

        expect(result).toEqual({ success: true });
    });

    it("returns success: false when tokenResult has errors", async () => {
        mockSignRealtimeToken.mockResolvedValue({
            token: "mock-token",
            errors: ["signing error"],
        });

        const result = await publishEvent(makePublishOptions());

        expect(result).toEqual({ success: false });
        expect(mockPublishGlobal).not.toHaveBeenCalled();
    });

    it("returns success: false when tokenResult has no token", async () => {
        mockSignRealtimeToken.mockResolvedValue({ token: null, errors: [] });

        const result = await publishEvent(makePublishOptions());

        expect(result).toEqual({ success: false });
        expect(mockPublishGlobal).not.toHaveBeenCalled();
    });

    it("returns success: false when publishGlobal returns errors", async () => {
        mockSignRealtimeToken.mockResolvedValue({
            token: "mock-token",
            errors: [],
        });
        mockPublishGlobal.mockResolvedValue({ errors: ["publish error"] });

        const result = await publishEvent(makePublishOptions());

        expect(result).toEqual({ success: false });
    });

    it("returns success: false when signRealtimeToken throws", async () => {
        mockSignRealtimeToken.mockRejectedValue(new Error("token error"));

        const result = await publishEvent(makePublishOptions());

        expect(result).toEqual({ success: false });
    });
});
