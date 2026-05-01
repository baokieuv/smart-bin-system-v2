"use client";

import { useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { usersAdminApi } from "@/services/api/users-admin";
import type { UserDto } from "@/types/user";

const states: UserDto["state"][] = ["ACTIVE", "PENDING", "SUSPENDED", "DELETED"];

export default function UsersPage() {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [message, setMessage] = useState("");

  const load = async () => {
    const response = await usersAdminApi.getUsers({ page: 1, size: 100 });
    setUsers(unwrapListPayload(response.data));
  };

  useEffect(() => {
    void load();
  }, []);

  const updateState = async (id: string, state: UserDto["state"]) => {
    try {
      await usersAdminApi.updateUserState(id, state);
      setMessage(`User ${id} updated to ${state}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    }
  };

  return (
    <Panel title="Users" subtitle="Admin moderation for account state">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2">Full name</th>
              <th className="py-2">Email</th>
              <th className="py-2">State</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-200/70">
                <td className="py-2 font-medium text-foreground">{`${user.firstName} ${user.lastName}`.trim()}</td>
                <td className="py-2 text-slate-600">{user.email}</td>
                <td className="py-2 text-slate-600">{user.state}</td>
                <td className="py-2">
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1"
                    value={user.state}
                    onChange={(event) => void updateState(user.id, event.target.value as UserDto["state"])}
                  >
                    {states.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </Panel>
  );
}

