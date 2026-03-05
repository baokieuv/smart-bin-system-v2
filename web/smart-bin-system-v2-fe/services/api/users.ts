const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9999/api/v1';

export const usersApi = {
    register: async (formData: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
    }) => {
        const response = await fetch(`${API_BASE_URL}/users/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });
        const data = await response.json();

        if (!response.ok){
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    },

    me: async (access_token: string) => {
        const response = await fetch(`${API_BASE_URL}/users/me`, {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });
        const data = await response.json();

        if (!response.ok){
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    },

    uploadImage: async (formData: FormData, access_token: string) => {
        const response = await fetch(`${API_BASE_URL}/users/upload-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
            body: formData,
        });

        const data = await response.json();

        if (!response.ok){
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    }
}