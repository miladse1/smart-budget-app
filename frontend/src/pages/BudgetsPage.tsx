import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Budget } from "../api/types";
import { BudgetRow } from "../components/BudgetRow";
import { Modal } from "../components/Modal";
import { Button, ErrorText, Field, Notice, controlClass } from "../components/ui";
import { useBudgetMonth } from "../hooks/useBudgetMonth";

function validLimit(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

export function BudgetsPage() {
  const queryClient = useQueryClient();
  const { year, month, value, setValue, ready, currency, appError } = useBudgetMonth();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [deleting, setDeleting] = useState<Budget | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const budgets = useQuery({
    queryKey: ["budgets", year, month],
    queryFn: () => api.budgets(year, month),
    enabled: ready,
  });
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });

  async function refresh() {
    await queryClient.invalidateQueries();
  }

  const create = useMutation({
    mutationFn: () => api.createBudget({ category_id: Number(categoryId), month, year, limit_amount: limit }),
    onSuccess: async () => {
      setAdding(false);
      setLimit("");
      setNotice("Budget saved.");
      await refresh();
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const update = useMutation({
    mutationFn: () => api.updateBudget(editing!.id, limit),
    onSuccess: async () => {
      setEditing(null);
      setNotice("Budget updated.");
      await refresh();
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteBudget(deleting!.id),
    onSuccess: async () => {
      setDeleting(null);
      setNotice("Budget deleted.");
      await refresh();
    },
    onError: (error: Error) => setNotice(error.message),
  });
  const copy = useMutation({
    mutationFn: () => api.copyBudgets(year, month),
    onSuccess: async (result) => {
      setNotice(result.message);
      await refresh();
    },
    onError: (error: Error) => setNotice(error.message),
  });

  if (appError) return <ErrorText>{appError}</ErrorText>;
  if (!ready || budgets.isLoading) return <p className="text-sm text-muted">Loading budgets…</p>;
  if (budgets.error instanceof Error) return <ErrorText>{budgets.error.message}</ErrorText>;

  const rows = budgets.data ?? [];
  const used = new Set(rows.map((row) => row.category_id));
  const available = (categories.data ?? []).filter(
    (category) => !used.has(category.id) && category.name !== "Income" && category.name !== "Transfer",
  );

  function openAdd() {
    setFormError("");
    setLimit("");
    setCategoryId(available[0] ? String(available[0].id) : "");
    setAdding(true);
  }

  function submitAdd() {
    if (!categoryId) {
      setFormError("Choose a category.");
      return;
    }
    if (!validLimit(limit)) {
      setFormError("Enter a limit greater than zero, with up to two decimal places.");
      return;
    }
    setFormError("");
    create.mutate();
  }

  function submitEdit() {
    if (!validLimit(limit)) {
      setFormError("Enter a limit greater than zero, with up to two decimal places.");
      return;
    }
    setFormError("");
    update.mutate();
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">Budgets</h1>
        <input aria-label="Month" type="month" value={value} onChange={(event) => setValue(event.target.value)} className={`${controlClass} w-auto`} />
        <Button variant="secondary" onClick={() => copy.mutate()} disabled={copy.isPending}>
          Copy previous month
        </Button>
        <Button onClick={openAdd}>Add budget</Button>
      </header>
      {notice && <Notice>{notice}</Notice>}

      <div className="rounded-lg border border-line bg-card px-3 shadow-sm">
        {rows.length === 0 ? (
          <p className="py-6 text-sm text-muted">No budgets for this month yet.</p>
        ) : (
          rows.map((budget) => (
            <div key={budget.id} className="flex flex-col gap-2 border-b border-line py-2 last:border-b-0 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <BudgetRow
                  name={budget.name}
                  icon={budget.icon}
                  colour={budget.colour}
                  spent={budget.spent}
                  limit={budget.limit_amount}
                  currency={currency}
                />
              </div>
              <div className="flex shrink-0 justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFormError("");
                    setLimit(budget.limit_amount);
                    setEditing(budget);
                  }}
                >
                  Edit
                </Button>
                <Button variant="secondary" onClick={() => setDeleting(budget)}>
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal open={adding} title="Add budget" onClose={() => setAdding(false)}>
        <div className="space-y-3">
          <Field label="Category">
            <select className={controlClass} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {available.length === 0 && <option value="">All categories already have a budget</option>}
              {available.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Limit (${currency})`}>
            <input className={controlClass} inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="200.00" />
          </Field>
          {formError && <ErrorText>{formError}</ErrorText>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={submitAdd} disabled={create.isPending || available.length === 0}>
              Save budget
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={editing !== null} title={editing ? `Edit ${editing.name}` : "Edit budget"} onClose={() => setEditing(null)}>
        <div className="space-y-3">
          <Field label={`Limit (${currency})`}>
            <input className={controlClass} inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} />
          </Field>
          {formError && <ErrorText>{formError}</ErrorText>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={submitEdit} disabled={update.isPending}>Save changes</Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleting !== null} title="Delete budget?" onClose={() => setDeleting(null)}>
        <p className="text-sm text-muted">
          {deleting ? `${deleting.name} will be removed for this month. Transactions stay in your history.` : ""}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Delete budget
          </Button>
        </div>
      </Modal>
    </div>
  );
}
