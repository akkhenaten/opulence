// Action definition helper: def(['company','security'], async (body, ctx) => result)
export const ALL = ['company', 'security', 'venue', 'officer'];
export const MGR = ['company', 'security'];
export const CO = ['company'];
export const def = (roles, fn) => ({ roles, fn });
export const pub = (fn) => ({ public: true, fn });
