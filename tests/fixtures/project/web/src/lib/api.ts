const course = (id: string) => `/courses/${id}`;
export const lessonsOf = (id: string) => fetch(`${course(id)}/lessons`);
export const api = { get: (path: string) => fetch(path).then((r) => r.json()) };
