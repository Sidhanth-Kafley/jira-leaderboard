import api from "@forge/api";
import {
    issueSearch,
    userSearch,
    getBoardsForProject,
    getSprintsForBoard,
    getUserPermissions,
} from "../src/apiCalls";
import {
    JiraUser,
    JiraIssueSearchResponse,
    JiraBoard,
    JiraSprint,
} from "../src/types";

jest.mock("@forge/api", () => ({
    __esModule: true,
    default: {
        asApp: jest.fn().mockReturnValue({
            requestJira: jest.fn(),
        }),
        asUser: jest.fn().mockReturnValue({
            requestJira: jest.fn(),
        }),
    },
    route: jest.fn(() => "/mock-route"),
}));

const mockRequestJiraAsApp = api.asApp().requestJira as jest.Mock;
const mockRequestJiraAsUser = api.asUser().requestJira as jest.Mock;

beforeEach(() => {
    mockRequestJiraAsApp.mockReset();
    mockRequestJiraAsUser.mockReset();
});

describe("issueSearch", () => {
    it("returns parsed issue search response on success", async () => {
        const mockResponse: JiraIssueSearchResponse = {
            isLast: true,
            issues: [],
            names: { customfield_10016: "Story point estimate" },
        };

        mockRequestJiraAsApp.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue(mockResponse),
        });

        const result = await issueSearch("project = TEST AND status = Done");

        expect(result).toEqual(mockResponse);
    });

    it("throws error when the response is not ok", async () => {
        mockRequestJiraAsApp.mockResolvedValue({ ok: false, status: 400 });

        await expect(issueSearch("project = TEST")).rejects.toThrow(
            "Jira Issue Search failed with status: 400",
        );
    });
});

describe("userSearch", () => {
    it("returns array of JiraUser on success", async () => {
        const mockUsers: JiraUser[] = [
            {
                accountId: "5b10a2844c20165700ede21g",
                displayName: "Mia Krystof",
            },
            {
                accountId: "5b10ac8d82e05b22cc7d4ef5",
                displayName: "Emma Richards",
            },
        ];

        mockRequestJiraAsApp.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue(mockUsers),
        });

        const result = await userSearch("testProject");

        expect(result).toEqual(mockUsers);
    });

    it("throws error when the response is not ok", async () => {
        mockRequestJiraAsApp.mockResolvedValue({ ok: false, status: 404 });

        await expect(userSearch("testProject")).rejects.toThrow(
            "Jira User Search failed with status: 404",
        );
    });
});

describe("getBoardsForProject", () => {
    it("returns array of JiraBoard", async () => {
        const mockBoards: JiraBoard[] = [{ id: "1" }, { id: "2" }];

        mockRequestJiraAsApp.mockResolvedValue({
            ok: true,
            json: jest
                .fn()
                .mockResolvedValue({ values: mockBoards, isLast: true }),
        });

        const result = await getBoardsForProject("TEST");

        expect(result).toEqual(mockBoards);
        expect(mockRequestJiraAsApp).toHaveBeenCalledTimes(1);
    });

    it("correctly paginates to return all boards", async () => {
        const page1: JiraBoard[] = [{ id: "1" }];
        const page2: JiraBoard[] = [{ id: "2" }];

        mockRequestJiraAsApp
            .mockResolvedValueOnce({
                ok: true,
                json: jest
                    .fn()
                    .mockResolvedValue({ values: page1, isLast: false }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: jest
                    .fn()
                    .mockResolvedValue({ values: page2, isLast: true }),
            });

        const result = await getBoardsForProject("TEST");

        expect(result).toEqual([...page1, ...page2]);
        expect(mockRequestJiraAsApp).toHaveBeenCalledTimes(2);
    });

    it("returns empty array when the response is not ok", async () => {
        mockRequestJiraAsApp.mockResolvedValue({ ok: false });

        const result = await getBoardsForProject("TEST");

        expect(result).toEqual([]);
    });

    it("returns empty array when values is empty", async () => {
        mockRequestJiraAsApp.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({ values: [], isLast: true }),
        });

        const result = await getBoardsForProject("TEST");

        expect(result).toEqual([]);
    });

    it("returns empty array when requestJira throws error", async () => {
        mockRequestJiraAsApp.mockRejectedValue(new Error("Network failure"));

        const result = await getBoardsForProject("TEST");

        expect(result).toEqual([]);
    });
});

describe("getSprintsForBoard", () => {
    it("returns array of JiraSprint", async () => {
        const mockSprints: JiraSprint[] = [
            { name: "Sprint 1" },
            { name: "Sprint 2" },
        ];

        mockRequestJiraAsApp.mockResolvedValue({
            ok: true,
            json: jest
                .fn()
                .mockResolvedValue({ values: mockSprints, isLast: true }),
        });

        const result = await getSprintsForBoard("1");

        expect(result).toEqual(mockSprints);
        expect(mockRequestJiraAsApp).toHaveBeenCalledTimes(1);
    });

    it("paginates to get all sprints across multiple pages", async () => {
        const page1: JiraSprint[] = [{ name: "Sprint 1" }];
        const page2: JiraSprint[] = [{ name: "Sprint 2" }];

        mockRequestJiraAsApp
            .mockResolvedValueOnce({
                ok: true,
                json: jest
                    .fn()
                    .mockResolvedValue({ values: page1, isLast: false }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: jest
                    .fn()
                    .mockResolvedValue({ values: page2, isLast: true }),
            });

        const result = await getSprintsForBoard("1");

        expect(result).toEqual([...page1, ...page2]);
        expect(mockRequestJiraAsApp).toHaveBeenCalledTimes(2);
    });

    it("returns empty array for non-scrum boards", async () => {
        mockRequestJiraAsApp.mockResolvedValue({ ok: false, status: 400 });

        const result = await getSprintsForBoard("1");

        expect(result).toEqual([]);
    });

    it("returns empty array when requestJira throws error", async () => {
        mockRequestJiraAsApp.mockRejectedValue(new Error("Network failure"));

        const result = await getSprintsForBoard("1");

        expect(result).toEqual([]);
    });
});

describe("getUserPermissions", () => {
    it("returns permission data for an admin user", async () => {
        const mockPermissions = {
            permissions: { ADMINISTER: { havePermission: true } },
        };

        mockRequestJiraAsUser.mockResolvedValue({
            json: jest.fn().mockResolvedValue(mockPermissions),
        });

        const result = await getUserPermissions();

        expect(result).toEqual(mockPermissions);
    });

    it("returns permission data for a non-admin user", async () => {
        const mockPermissions = {
            permissions: { ADMINISTER: { havePermission: false } },
        };

        mockRequestJiraAsUser.mockResolvedValue({
            json: jest.fn().mockResolvedValue(mockPermissions),
        });

        const result = await getUserPermissions();

        expect(result).toEqual(mockPermissions);
        expect(result.permissions.ADMINISTER.havePermission).toBe(false);
    });
});
