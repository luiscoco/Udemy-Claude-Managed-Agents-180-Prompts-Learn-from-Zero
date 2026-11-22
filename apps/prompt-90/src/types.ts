export type Data = Record<string, any>;
export type Field = {
    key: string;
    label: string;
    value: string | number | boolean;
    options?: (string | number)[];
    multiline?: boolean;
};
export type Action = {
    id: string;
    label: string;
    op: string;
    args?: Data;
};
export type Step = {
    action: string;
    input?: Data;
};
export type Lesson = {
    number: number;
    title: string;
    prompt: string;
    section: string;
    examples: {
        language: string;
        code: string;
        label: string;
    }[];
    sources: string[];
    fields: Field[];
    actions: Action[];
    walkthrough: Step[];
    initial: Data;
    takeaway: string;
};
export type State = {
    revision: number;
    status: string;
    resources: Data;
    files: Record<string, string>;
    events: Data[];
    rows: Data[];
    result: Data;
    seen: string[];
    metrics: Data;
    artifacts: {
        name: string;
        text?: string;
        path?: string;
    }[];
};
export function initialState(lesson: Lesson): State {
    return { revision: 0, status: 'ready', resources: structuredClone(lesson.initial), files: {}, events: [], rows: [], result: {}, seen: [], metrics: {}, artifacts: [] };
}
