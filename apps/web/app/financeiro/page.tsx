"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  AlertTriangle,
  Banknote,
  ChartSpline,
  HandCoins,
  Handshake,
  ReceiptText,
  RefreshCcw
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  DashboardChartCard,
  DashboardHero,
  DashboardLegend,
  DashboardMetricTile,
  DashboardPulseCard,
  dashboardScopeLabel
} from "@/components/dashboard-kit";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELED";
type ChargeChannel = "EMAIL" | "WHATSAPP" | "SMS" | "PHONE" | "PORTAL" | "MANUAL";
type ChargeStatus = "SCHEDULED" | "SENT" | "VIEWED" | "PROMISED" | "PAID" | "CANCELED";
type PaymentMethod = "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BANK_SLIP" | "CASH" | "TRANSFER" | "OTHER";

type FinanceOptionsPayload = {
  statuses: InvoiceStatus[];
  paymentMethods: PaymentMethod[];
  chargeChannels: ChargeChannel[];
  customers: Array<{ id: string; name: string }>;
  serviceOrders: Array<{ id: string; code: string; title: string; customerId?: string | null }>;
  quotes: Array<{ id: string; code: string; status: string; total: number; customerId?: string | null }>;
  deskTickets: Array<{ id: string; code: string; title: string; customerId?: string | null }>;
};

type FinanceSummaryPayload = {
  totalInvoices: number;
  overdue: number;
  byStatus: {
    draft: number;
    issued: number;
    partiallyPaid: number;
    paid: number;
    overdue: number;
    canceled: number;
  };
  amounts: {
    total: number;
    paid: number;
    open: number;
    received: number;
  };
  payments: {
    entries: number;
  };
};

type FinanceDashboardPayload = {
  quotes: {
    conversionRate: number;
  };
  expensesAndKm: {
    totalAmount: number;
    byType: Array<{
      type: string;
      totalAmount: number;
    }>;
  };
  finance: {
    totalInvoices: number;
    overdue: number;
    byStatus: {
      draft: number;
      issued: number;
      partiallyPaid: number;
      paid: number;
      overdue: number;
      canceled: number;
    };
    amounts: {
      total: number;
      paid: number;
      open: number;
      received: number;
    };
  };
};

type FinancialInvoice = {
  id: string;
  code: string;
  status: InvoiceStatus;
  description?: string | null;
  dueDate: string;
  issueDate?: string | null;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  customer: { id: string; name: string };
  serviceOrder?: { id: string; code: string; title: string; status: string } | null;
  quote?: { id: string; code: string; status: string; total: number } | null;
  deskTicket?: { id: string; code: string; title: string; status: string } | null;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: PaymentMethod;
    paidAt: string;
    reference?: string | null;
  }>;
  charges: Array<{
    id: string;
    channel: ChargeChannel;
    status: ChargeStatus;
    createdAt: string;
    sentAt?: string | null;
  }>;
};

type ExpenseType = "FUEL" | "TOLL" | "PARKING" | "MEAL" | "LODGING" | "OTHER";
type ExpenseStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type ExpenseEntry = {
  id: string;
  type: ExpenseType;
  amount: number;
  currency: string;
  expenseDate: string;
  status: ExpenseStatus;
};

type CustomerFinanceFlag = {
  customerId: string;
  customerName: string;
  invoices: string[];
  balance: number;
};

const STATUS_META: Record<InvoiceStatus, { label: string; className: string }> = {
  DRAFT: { label: "Rascunho", className: "bg-slate-100 text-slate-700" },
  ISSUED: { label: "Emitida", className: "bg-sky-100 text-sky-700" },
  PARTIALLY_PAID: { label: "Parcial", className: "bg-amber-100 text-amber-700" },
  PAID: { label: "Paga", className: "bg-emerald-100 text-emerald-700" },
  OVERDUE: { label: "Vencida", className: "bg-rose-100 text-rose-700" },
  CANCELED: { label: "Cancelada", className: "bg-slate-200 text-slate-600" }
};

const CHART_COLORS = ["#0d5f80", "#14b8a6", "#f59e0b", "#ef4444", "#22c55e", "#6366f1"];

const pieValueLabel = ({ value }: { value?: number }) =>
  typeof value === "number" && value > 0 ? `${value}` : "";

const yAxisWithHeadroom = (dataMax: number) => {
  const safeMax = Number.isFinite(dataMax) ? dataMax : 0;
  if (safeMax <= 0) {
    return 1;
  }
  return Math.ceil(safeMax + Math.max(1, safeMax * 0.2));
};

const yAxisWithSignedHeadroomMin = (dataMin: number) => {
  const safeMin = Number.isFinite(dataMin) ? dataMin : 0;
  if (safeMin >= 0) {
    return 0;
  }
  return Math.floor(safeMin - Math.max(1, Math.abs(safeMin) * 0.2));
};

const toMoney = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const roundToMoney = (value: number) => Number((value || 0).toFixed(2));

const toChartTick = (value: number) => {
  const amount = Number(value) || 0;
  const abs = Math.abs(amount);

  if (abs >= 1_000_000) {
    return `${(amount / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  }

  if (abs >= 1_000) {
    return `${(amount / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }

  return amount.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
};

const toBarLabel = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) {
    return "";
  }

  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return `${(amount / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  }
  if (abs >= 1_000) {
    return `${(amount / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  if (abs < 100) {
    return amount.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  }
  return amount.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
};

const toDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "-";

const parseNumber = (value: string) => {
  const normalized = Number(value.replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
};

const toDateLabel = (value: Date) =>
  value.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  });

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const toMonthKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;

const toMonthLabel = (value: Date) =>
  value.toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit"
  });

type InvoiceDraftItem = {
  description: string;
  quantity: string;
  unitPrice: string;
};

export default function FinanceiroPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dashboardWindowDays, setDashboardWindowDays] = useState(30);

  const [openCreate, setOpenCreate] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<FinancialInvoice | null>(null);
  const [chargeInvoice, setChargeInvoice] = useState<FinancialInvoice | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "ALL">("ALL");
  const [customerFilter, setCustomerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [monthlyRevenueTargetInput, setMonthlyRevenueTargetInput] = useState("50000");
  const [monthlyExpenseTargetInput, setMonthlyExpenseTargetInput] = useState("25000");

  const [customerId, setCustomerId] = useState("");
  const [serviceOrderId, setServiceOrderId] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [deskTicketId, setDeskTicketId] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [penalties, setPenalties] = useState("0");
  const [items, setItems] = useState<InvoiceDraftItem[]>([{ description: "", quantity: "1", unitPrice: "0" }]);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [paymentReference, setPaymentReference] = useState("");

  const [chargeChannel, setChargeChannel] = useState<ChargeChannel>("WHATSAPP");
  const [chargeNote, setChargeNote] = useState("");

  const optionsQuery = useQuery({
    queryKey: ["finance-options"],
    queryFn: () => api.get<FinanceOptionsPayload>("/finance/options")
  });

  const summaryQuery = useQuery({
    queryKey: ["finance-summary"],
    queryFn: () => api.get<FinanceSummaryPayload>("/finance/summary")
  });

  const periodRange = useMemo(() => {
    const dateTo = new Date();
    const dateFrom = new Date(Date.now() - dashboardWindowDays * DAY_IN_MS);
    return {
      dateFrom,
      dateTo,
      dateFromIso: dateFrom.toISOString(),
      dateToIso: dateTo.toISOString()
    };
  }, [dashboardWindowDays]);

  const planningRange = useMemo(() => {
    const now = new Date();
    const historyStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const historyEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const forecastEnd = new Date(now.getTime() + 90 * DAY_IN_MS);

    const historyMonths = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(historyStart.getFullYear(), historyStart.getMonth() + index, 1);
      return {
        key: toMonthKey(date),
        label: toMonthLabel(date)
      };
    });

    const forecastMonths = Array.from({ length: 3 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
      return {
        key: toMonthKey(date),
        label: toMonthLabel(date)
      };
    });

    return {
      now,
      historyStartIso: historyStart.toISOString(),
      historyEndIso: historyEnd.toISOString(),
      forecastEnd,
      forecastEndIso: forecastEnd.toISOString(),
      historyMonths,
      forecastMonths
    };
  }, []);

  const dashboardQuery = useQuery({
    queryKey: ["finance-dashboard-overview", dashboardWindowDays],
    queryFn: () => {
      return api.get<FinanceDashboardPayload>(
        `/reports/overview?dateFrom=${encodeURIComponent(periodRange.dateFromIso)}&dateTo=${encodeURIComponent(periodRange.dateToIso)}`
      );
    }
  });

  const approvedExpensesQuery = useQuery({
    queryKey: ["finance-corporate-approved-expenses", dashboardWindowDays],
    queryFn: () =>
      api.get<ExpenseEntry[]>(
        `/expenses?status=APPROVED&dateFrom=${encodeURIComponent(periodRange.dateFromIso)}&dateTo=${encodeURIComponent(periodRange.dateToIso)}`
      )
  });

  const submittedExpensesQuery = useQuery({
    queryKey: ["finance-corporate-submitted-expenses", dashboardWindowDays],
    queryFn: () =>
      api.get<ExpenseEntry[]>(
        `/expenses?status=SUBMITTED&dateFrom=${encodeURIComponent(periodRange.dateFromIso)}&dateTo=${encodeURIComponent(periodRange.dateToIso)}`
      )
  });

  const receivablesPortfolioQuery = useQuery({
    queryKey: ["finance-receivables-portfolio"],
    queryFn: () =>
      api.get<FinancialInvoice[]>(
        "/finance/invoices?status=ISSUED,PARTIALLY_PAID,OVERDUE"
      )
  });

  const monthlyInvoiceHistoryQuery = useQuery({
    queryKey: [
      "finance-monthly-history-invoices",
      planningRange.historyStartIso,
      planningRange.forecastEndIso
    ],
    queryFn: () =>
      api.get<FinancialInvoice[]>(
        `/finance/invoices?dateFrom=${encodeURIComponent(planningRange.historyStartIso)}&dateTo=${encodeURIComponent(
          planningRange.forecastEndIso
        )}`
      )
  });

  const monthlyApprovedExpensesHistoryQuery = useQuery({
    queryKey: [
      "finance-monthly-history-expenses",
      planningRange.historyStartIso,
      planningRange.historyEndIso
    ],
    queryFn: () =>
      api.get<ExpenseEntry[]>(
        `/expenses?status=APPROVED&dateFrom=${encodeURIComponent(planningRange.historyStartIso)}&dateTo=${encodeURIComponent(
          planningRange.historyEndIso
        )}`
      )
  });

  const invoicesQuery = useQuery({
    queryKey: ["finance-invoices", statusFilter, customerFilter, search, overdueOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (customerFilter) params.set("customerId", customerFilter);
      if (search.trim()) params.set("search", search.trim());
      if (overdueOnly) params.set("overdueOnly", "true");
      return api.get<FinancialInvoice[]>(`/finance/invoices?${params.toString()}`);
    }
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["finance-summary"] });
    queryClient.invalidateQueries({ queryKey: ["finance-dashboard-overview"] });
    queryClient.invalidateQueries({ queryKey: ["finance-corporate-approved-expenses"] });
    queryClient.invalidateQueries({ queryKey: ["finance-corporate-submitted-expenses"] });
    queryClient.invalidateQueries({ queryKey: ["finance-receivables-portfolio"] });
    queryClient.invalidateQueries({ queryKey: ["finance-monthly-history-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["finance-monthly-history-expenses"] });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["expenses-summary"] });
    queryClient.invalidateQueries({ queryKey: ["reports-overview"] });
  };

  const createInvoiceMutation = useMutation({
    mutationFn: () => {
      const payloadItems = items
        .map((item) => ({
          description: item.description.trim(),
          quantity: parseNumber(item.quantity),
          unitPrice: parseNumber(item.unitPrice)
        }))
        .filter((item) => item.description && item.quantity > 0);

      if (!payloadItems.length) {
        throw new Error("Inclua ao menos um item valido");
      }

      if (!dueDate) {
        throw new Error("Informe a data de vencimento");
      }

      return api.post<FinancialInvoice>("/finance/invoices", {
        customerId: customerId || undefined,
        serviceOrderId: serviceOrderId || undefined,
        quoteId: quoteId || undefined,
        deskTicketId: deskTicketId || undefined,
        description: description.trim() || undefined,
        dueDate: new Date(`${dueDate}T23:59:59`).toISOString(),
        discount: parseNumber(discount),
        penalties: parseNumber(penalties),
        items: payloadItems
      });
    },
    onSuccess: () => {
      setOpenCreate(false);
      setCustomerId("");
      setServiceOrderId("");
      setQuoteId("");
      setDeskTicketId("");
      setDescription("");
      setDueDate("");
      setDiscount("0");
      setPenalties("0");
      setItems([{ description: "", quantity: "1", unitPrice: "0" }]);
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const issueInvoiceMutation = useMutation({
    mutationFn: (invoiceId: string) => api.post<FinancialInvoice>(`/finance/invoices/${invoiceId}/issue`, {}),
    onSuccess: refresh,
    onError: (error) => setErrorMsg(error.message)
  });

  const cancelInvoiceMutation = useMutation({
    mutationFn: (invoiceId: string) => api.post<FinancialInvoice>(`/finance/invoices/${invoiceId}/cancel`, {}),
    onSuccess: refresh,
    onError: (error) => setErrorMsg(error.message)
  });

  const registerPaymentMutation = useMutation({
    mutationFn: () => {
      if (!paymentInvoice) {
        throw new Error("Selecione uma fatura");
      }
      const amount = parseNumber(paymentAmount);
      if (amount <= 0) {
        throw new Error("Informe um valor de pagamento valido");
      }

      return api.post<FinancialInvoice>(`/finance/invoices/${paymentInvoice.id}/register-payment`, {
        amount,
        method: paymentMethod,
        reference: paymentReference.trim() || undefined
      });
    },
    onSuccess: () => {
      setPaymentInvoice(null);
      setPaymentAmount("");
      setPaymentMethod("PIX");
      setPaymentReference("");
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const createChargeMutation = useMutation({
    mutationFn: () => {
      if (!chargeInvoice) {
        throw new Error("Selecione uma fatura");
      }

      return api.post(`/finance/invoices/${chargeInvoice.id}/charges`, {
        channel: chargeChannel,
        note: chargeNote.trim() || undefined,
        sendNow: true
      });
    },
    onSuccess: () => {
      setChargeInvoice(null);
      setChargeChannel("WHATSAPP");
      setChargeNote("");
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const options = optionsQuery.data;
  const summary = summaryQuery.data;
  const dashboard = dashboardQuery.data;
  const approvedExpenses = approvedExpensesQuery.data ?? [];
  const submittedExpenses = submittedExpensesQuery.data ?? [];
  const receivablesPortfolio = receivablesPortfolioQuery.data ?? [];
  const monthlyInvoiceHistory = monthlyInvoiceHistoryQuery.data ?? [];
  const monthlyApprovedExpensesHistory = monthlyApprovedExpensesHistoryQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];

  const invoiceStatusChart = useMemo(
    () => [
      { name: "Emitidas", value: dashboard?.finance.byStatus.issued ?? 0 },
      { name: "Parciais", value: dashboard?.finance.byStatus.partiallyPaid ?? 0 },
      { name: "Pagas", value: dashboard?.finance.byStatus.paid ?? 0 },
      { name: "Vencidas", value: dashboard?.finance.byStatus.overdue ?? 0 },
      { name: "Rascunho", value: dashboard?.finance.byStatus.draft ?? 0 }
    ],
    [dashboard?.finance.byStatus]
  );

  const expenseByTypeChart = useMemo(() => {
    const source = dashboard?.expensesAndKm.byType ?? [];
    return source
      .slice()
      .sort((left, right) => right.totalAmount - left.totalAmount)
      .slice(0, 6)
      .map((item) => ({
        type: item.type,
        total: item.totalAmount
      }));
  }, [dashboard?.expensesAndKm.byType]);

  const approvedExpenseTotal = useMemo(
    () => approvedExpenses.reduce((acc, item) => acc + item.amount, 0),
    [approvedExpenses]
  );

  const submittedExpenseTotal = useMemo(
    () => submittedExpenses.reduce((acc, item) => acc + item.amount, 0),
    [submittedExpenses]
  );

  const receivablesPortfolioSummary = useMemo(() => {
    let current = 0;
    let overdue = 0;
    let agreement = 0;

    for (const invoice of receivablesPortfolio) {
      if (invoice.balanceAmount <= 0) {
        continue;
      }

      const hasAgreement = invoice.charges.some((charge) => charge.status === "PROMISED");
      const isOverdue =
        invoice.status === "OVERDUE" || new Date(invoice.dueDate).getTime() < Date.now();

      if (hasAgreement) {
        agreement += invoice.balanceAmount;
      } else if (isOverdue) {
        overdue += invoice.balanceAmount;
      } else {
        current += invoice.balanceAmount;
      }
    }

    const total = current + overdue + agreement;
    const overdueRate = total > 0 ? (overdue / total) * 100 : 0;

    return {
      current,
      overdue,
      agreement,
      total,
      overdueRate
    };
  }, [receivablesPortfolio]);

  const receivablesPieChart = useMemo(
    () => [
      { name: "Em dia", value: receivablesPortfolioSummary.current },
      { name: "Em atraso", value: receivablesPortfolioSummary.overdue },
      { name: "Em acordo", value: receivablesPortfolioSummary.agreement }
    ],
    [receivablesPortfolioSummary]
  );

  const agingReceivablesChart = useMemo(() => {
    const buckets = {
      due: 0,
      d1_30: 0,
      d31_60: 0,
      d61_90: 0,
      d90_plus: 0
    };

    for (const invoice of receivablesPortfolio) {
      if (invoice.balanceAmount <= 0) {
        continue;
      }

      const daysDiff = Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / DAY_IN_MS);

      if (daysDiff <= 0) {
        buckets.due += invoice.balanceAmount;
      } else if (daysDiff <= 30) {
        buckets.d1_30 += invoice.balanceAmount;
      } else if (daysDiff <= 60) {
        buckets.d31_60 += invoice.balanceAmount;
      } else if (daysDiff <= 90) {
        buckets.d61_90 += invoice.balanceAmount;
      } else {
        buckets.d90_plus += invoice.balanceAmount;
      }
    }

    return [
      { faixa: "A vencer", total: buckets.due },
      { faixa: "1-30d", total: buckets.d1_30 },
      { faixa: "31-60d", total: buckets.d31_60 },
      { faixa: "61-90d", total: buckets.d61_90 },
      { faixa: "90d+", total: buckets.d90_plus }
    ];
  }, [receivablesPortfolio]);

  const corporateFlowChart = useMemo(
    () => [
      { name: "Emitido", total: dashboard?.finance.amounts.total ?? 0 },
      { name: "Recebido", total: dashboard?.finance.amounts.received ?? 0 },
      { name: "Despesa aprovada", total: approvedExpenseTotal },
      { name: "Compromisso pendente", total: submittedExpenseTotal }
    ],
    [approvedExpenseTotal, dashboard?.finance.amounts.received, dashboard?.finance.amounts.total, submittedExpenseTotal]
  );

  const corporateResult = useMemo(() => {
    const received = dashboard?.finance.amounts.received ?? 0;
    const operatingResult = received - approvedExpenseTotal;
    const operatingMargin = received > 0 ? (operatingResult / received) * 100 : 0;

    return {
      received,
      operatingResult,
      operatingMargin
    };
  }, [approvedExpenseTotal, dashboard?.finance.amounts.received]);

  const monthlyTargets = useMemo(() => {
    const revenueTarget = Math.max(parseNumber(monthlyRevenueTargetInput), 0);
    const expenseTarget = Math.max(parseNumber(monthlyExpenseTargetInput), 0);
    return {
      revenueTarget,
      expenseTarget,
      resultTarget: revenueTarget - expenseTarget
    };
  }, [monthlyExpenseTargetInput, monthlyRevenueTargetInput]);

  const monthlyRevenueByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const month of planningRange.historyMonths) {
      map.set(month.key, 0);
    }

    for (const invoice of monthlyInvoiceHistory) {
      for (const payment of invoice.payments) {
        const paidAt = new Date(payment.paidAt);
        const key = toMonthKey(paidAt);
        if (!map.has(key)) {
          continue;
        }
        map.set(key, (map.get(key) ?? 0) + payment.amount);
      }
    }

    return map;
  }, [monthlyInvoiceHistory, planningRange.historyMonths]);

  const monthlyExpenseByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const month of planningRange.historyMonths) {
      map.set(month.key, 0);
    }

    for (const entry of monthlyApprovedExpensesHistory) {
      const key = toMonthKey(new Date(entry.expenseDate));
      if (!map.has(key)) {
        continue;
      }
      map.set(key, (map.get(key) ?? 0) + entry.amount);
    }

    return map;
  }, [monthlyApprovedExpensesHistory, planningRange.historyMonths]);

  const monthlyGoalsRevenueChart = useMemo(
    () =>
      planningRange.historyMonths.map((month) => ({
        mes: month.label,
        realizado: monthlyRevenueByMonth.get(month.key) ?? 0,
        meta: monthlyTargets.revenueTarget
      })),
    [monthlyRevenueByMonth, monthlyTargets.revenueTarget, planningRange.historyMonths]
  );

  const monthlyGoalsResultChart = useMemo(
    () =>
      planningRange.historyMonths.map((month) => {
        const revenue = monthlyRevenueByMonth.get(month.key) ?? 0;
        const expense = monthlyExpenseByMonth.get(month.key) ?? 0;
        return {
          mes: month.label,
          realizado: revenue - expense,
          meta: monthlyTargets.resultTarget
        };
      }),
    [monthlyExpenseByMonth, monthlyRevenueByMonth, monthlyTargets.resultTarget, planningRange.historyMonths]
  );

  const forecastCashFlowChart = useMemo(() => {
    const receiptsMap = new Map<string, number>();
    for (const month of planningRange.forecastMonths) {
      receiptsMap.set(month.key, 0);
    }

    for (const invoice of receivablesPortfolio) {
      if (invoice.balanceAmount <= 0) {
        continue;
      }

      const dueDate = new Date(invoice.dueDate);
      if (dueDate.getTime() < planningRange.now.getTime() || dueDate.getTime() > planningRange.forecastEnd.getTime()) {
        continue;
      }

      const key = toMonthKey(dueDate);
      if (!receiptsMap.has(key)) {
        continue;
      }

      receiptsMap.set(key, (receiptsMap.get(key) ?? 0) + invoice.balanceAmount);
    }

    const recentExpenseValues = planningRange.historyMonths
      .slice(-3)
      .map((month) => monthlyExpenseByMonth.get(month.key) ?? 0);

    const avgRecentExpenses = recentExpenseValues.length
      ? recentExpenseValues.reduce((acc, value) => acc + value, 0) / recentExpenseValues.length
      : 0;

    return planningRange.forecastMonths.map((month) => {
      const forecastReceipt = roundToMoney(receiptsMap.get(month.key) ?? 0);
      const forecastExpense = roundToMoney(avgRecentExpenses);
      return {
        mes: month.label,
        recebimentosPrevistos: forecastReceipt,
        despesasPrevistas: forecastExpense,
        resultadoPrevisto: roundToMoney(forecastReceipt - forecastExpense)
      };
    });
  }, [monthlyExpenseByMonth, planningRange, receivablesPortfolio]);

  const forecastTotals = useMemo(
    () => {
      const totals = forecastCashFlowChart.reduce(
        (acc, item) => {
          acc.receipts += item.recebimentosPrevistos;
          acc.expenses += item.despesasPrevistas;
          acc.result += item.resultadoPrevisto;
          return acc;
        },
        { receipts: 0, expenses: 0, result: 0 }
      );

      return {
        receipts: roundToMoney(totals.receipts),
        expenses: roundToMoney(totals.expenses),
        result: roundToMoney(totals.result)
      };
    },
    [forecastCashFlowChart]
  );

  const customerRisk = useMemo(() => {
    const overdueMap = new Map<string, CustomerFinanceFlag>();
    const agreementMap = new Map<string, CustomerFinanceFlag>();

    for (const invoice of invoices) {
      if (invoice.balanceAmount <= 0) {
        continue;
      }

      const hasAgreement = invoice.charges.some((charge) => charge.status === "PROMISED");
      const isOverdue = invoice.status === "OVERDUE";

      if (hasAgreement) {
        const current = agreementMap.get(invoice.customer.id);
        if (current) {
          current.balance += invoice.balanceAmount;
          current.invoices.push(invoice.code);
        } else {
          agreementMap.set(invoice.customer.id, {
            customerId: invoice.customer.id,
            customerName: invoice.customer.name,
            invoices: [invoice.code],
            balance: invoice.balanceAmount
          });
        }
        continue;
      }

      if (isOverdue) {
        const current = overdueMap.get(invoice.customer.id);
        if (current) {
          current.balance += invoice.balanceAmount;
          current.invoices.push(invoice.code);
        } else {
          overdueMap.set(invoice.customer.id, {
            customerId: invoice.customer.id,
            customerName: invoice.customer.name,
            invoices: [invoice.code],
            balance: invoice.balanceAmount
          });
        }
      }
    }

    const byHigherBalance = (left: CustomerFinanceFlag, right: CustomerFinanceFlag) =>
      right.balance - left.balance;

    return {
      overdue: [...overdueMap.values()].sort(byHigherBalance),
      agreement: [...agreementMap.values()].sort(byHigherBalance)
    };
  }, [invoices]);

  const filteredServiceOrders = useMemo(() => {
    if (!customerId) return options?.serviceOrders ?? [];
    return (options?.serviceOrders ?? []).filter((order) => order.customerId === customerId);
  }, [customerId, options?.serviceOrders]);

  const filteredQuotes = useMemo(() => {
    if (!customerId) return options?.quotes ?? [];
    return (options?.quotes ?? []).filter((quote) => quote.customerId === customerId);
  }, [customerId, options?.quotes]);

  const filteredTickets = useMemo(() => {
    if (!customerId) return options?.deskTickets ?? [];
    return (options?.deskTickets ?? []).filter((ticket) => ticket.customerId === customerId);
  }, [customerId, options?.deskTickets]);

  const refreshAll = async () => {
    await Promise.all([
      dashboardQuery.refetch(),
      summaryQuery.refetch(),
      invoicesQuery.refetch(),
      approvedExpensesQuery.refetch(),
      submittedExpensesQuery.refetch(),
      receivablesPortfolioQuery.refetch(),
      monthlyInvoiceHistoryQuery.refetch(),
      monthlyApprovedExpensesHistoryQuery.refetch()
    ]);
  };

  const isRefreshing =
    dashboardQuery.isRefetching ||
    summaryQuery.isRefetching ||
    invoicesQuery.isRefetching ||
    approvedExpensesQuery.isRefetching ||
    submittedExpensesQuery.isRefetching ||
    receivablesPortfolioQuery.isRefetching ||
    monthlyInvoiceHistoryQuery.isRefetching ||
    monthlyApprovedExpensesHistoryQuery.isRefetching;

  const visibleInvoiceStatusChart = invoiceStatusChart.filter((item) => item.value > 0);
  const visibleReceivablesPieChart = receivablesPieChart.filter((item) => item.value > 0);

  return (
    <RequireAuth>
      <AppShell>
        <DashboardHero
          actions={
            <>
              {[7, 30, 90].map((days) => (
                <Button
                  className={days === dashboardWindowDays ? "" : "border-slate-300 text-slate-700"}
                  key={days}
                  onClick={() => setDashboardWindowDays(days)}
                  type="button"
                  variant={days === dashboardWindowDays ? "default" : "outline"}
                >
                  {days} dias
                </Button>
              ))}
              <Button onClick={refreshAll} type="button" variant="outline">
                <RefreshCcw className={`mr-1 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Atualizar leitura
              </Button>
              <Button onClick={() => router.push("/reports")} type="button" variant="outline">
                Relatorios
              </Button>
              <Dialog open={openCreate} onOpenChange={setOpenCreate}>
                <DialogTrigger asChild>
                  <Button>Nova fatura</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-auto">
                  <DialogHeader>
                    <DialogTitle>Criar fatura</DialogTitle>
                  </DialogHeader>
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setErrorMsg(null);
                      createInvoiceMutation.mutate();
                    }}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-semibold">Cliente</label>
                        <select
                          className="w-full rounded-xl border px-3 py-2"
                          value={customerId}
                          onChange={(event) => setCustomerId(event.target.value)}
                        >
                          <option value="">Selecione</option>
                          {(options?.customers ?? []).map((customer) => (
                            <option key={customer.id} value={customer.id}>
                              {customer.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-semibold">Vencimento</label>
                        <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-semibold">Ordem de servico</label>
                        <select
                          className="w-full rounded-xl border px-3 py-2"
                          value={serviceOrderId}
                          onChange={(event) => setServiceOrderId(event.target.value)}
                        >
                          <option value="">Nenhuma</option>
                          {filteredServiceOrders.map((order) => (
                            <option key={order.id} value={order.id}>
                              {order.code} - {order.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-semibold">Orcamento</label>
                        <select
                          className="w-full rounded-xl border px-3 py-2"
                          value={quoteId}
                          onChange={(event) => setQuoteId(event.target.value)}
                        >
                          <option value="">Nenhum</option>
                          {filteredQuotes.map((quote) => (
                            <option key={quote.id} value={quote.id}>
                              {quote.code}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-semibold">Ticket</label>
                        <select
                          className="w-full rounded-xl border px-3 py-2"
                          value={deskTicketId}
                          onChange={(event) => setDeskTicketId(event.target.value)}
                        >
                          <option value="">Nenhum</option>
                          {filteredTickets.map((ticket) => (
                            <option key={ticket.id} value={ticket.id}>
                              {ticket.code} - {ticket.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-semibold">Desconto</label>
                        <Input value={discount} onChange={(event) => setDiscount(event.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-semibold">Multas/Juros</label>
                        <Input value={penalties} onChange={(event) => setPenalties(event.target.value)} />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold">Descricao</label>
                      <textarea
                        className="w-full rounded-xl border px-3 py-2"
                        rows={3}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                      />
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold">Itens</p>
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() =>
                            setItems((current) => [...current, { description: "", quantity: "1", unitPrice: "0" }])
                          }
                        >
                          + Item
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {items.map((item, index) => (
                          <div className="grid gap-2 md:grid-cols-12" key={`invoice-item-${index}`}>
                            <Input
                              className="md:col-span-6"
                              placeholder="Descricao"
                              value={item.description}
                              onChange={(event) => {
                                const next = [...items];
                                next[index].description = event.target.value;
                                setItems(next);
                              }}
                            />
                            <Input
                              className="md:col-span-2"
                              placeholder="Qtd"
                              value={item.quantity}
                              onChange={(event) => {
                                const next = [...items];
                                next[index].quantity = event.target.value;
                                setItems(next);
                              }}
                            />
                            <Input
                              className="md:col-span-3"
                              placeholder="Unitario"
                              value={item.unitPrice}
                              onChange={(event) => {
                                const next = [...items];
                                next[index].unitPrice = event.target.value;
                                setItems(next);
                              }}
                            />
                            <Button
                              className="md:col-span-1"
                              variant="danger"
                              type="button"
                              onClick={() =>
                                setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
                              }
                              disabled={items.length === 1}
                            >
                              X
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                    <Button className="w-full" type="submit" disabled={createInvoiceMutation.isPending}>
                      {createInvoiceMutation.isPending ? "Criando..." : "Criar fatura"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          }
          aside={
            <>
              <DashboardPulseCard
                label="Recebido no periodo"
                note={dashboardScopeLabel(dashboardWindowDays)}
                value={toMoney(dashboard?.finance.amounts.received ?? 0)}
              />
              <DashboardPulseCard
                accentClassName="text-brand-primary"
                label="Carteira aberta"
                note="emitidas, parciais e vencidas"
                value={toMoney(receivablesPortfolioSummary.total)}
              />
              <DashboardPulseCard
                accentClassName="text-rose-600"
                label="Inadimplencia"
                note="percentual sobre carteira aberta"
                value={`${receivablesPortfolioSummary.overdueRate.toFixed(1)}%`}
              />
              <DashboardPulseCard
                accentClassName={forecastTotals.result >= 0 ? "text-emerald-700" : "text-rose-600"}
                label="Previsao 90 dias"
                note="resultado previsto de caixa"
                value={toMoney(forecastTotals.result)}
              />
            </>
          }
          description="Camada executiva para carteira, caixa, previsao, cobranca e saude financeira, sem perder o operacional de emissao e recebimento."
          eyebrow={
            <>
              <ChartSpline className="h-3.5 w-3.5" />
              Dashboard financeiro
            </>
          }
          footer="Graficos do topo seguem o filtro 7/30/90. Previsoes de caixa e metas usam escopo mensal proprio indicado no titulo."
          title="Financeiro corporativo com leitura executiva e cobranca integrada"
        />

        <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <DashboardMetricTile
            label="Faturas no periodo"
            note={`ultimos ${dashboardWindowDays} dias`}
            value={dashboard?.finance.totalInvoices ?? 0}
          />
          <DashboardMetricTile
            label="A receber no periodo"
            note="segue o filtro selecionado"
            value={toMoney(dashboard?.finance.amounts.open ?? 0)}
            valueClassName="text-[clamp(1.1rem,1.3vw,1.8rem)]"
          />
          <DashboardMetricTile
            accent="emerald"
            label="Recebido no periodo"
            note="janela selecionada"
            value={toMoney(dashboard?.finance.amounts.received ?? 0)}
            valueClassName="text-[clamp(1.1rem,1.3vw,1.8rem)]"
          />
          <DashboardMetricTile
            accent="rose"
            label="Faturas vencidas"
            note={`ultimos ${dashboardWindowDays} dias`}
            value={dashboard?.finance.overdue ?? 0}
          />
          <DashboardMetricTile
            label="Despesas de campo"
            note="mesma janela executiva"
            value={toMoney(dashboard?.expensesAndKm.totalAmount ?? 0)}
            valueClassName="text-[clamp(1.1rem,1.3vw,1.8rem)]"
          />
          <DashboardMetricTile
            accent="teal"
            label="Conversao de orcamento"
            note={`ultimos ${dashboardWindowDays} dias`}
            value={`${(dashboard?.quotes.conversionRate ?? 0).toFixed(1)}%`}
          />
        </section>

        <section className="mb-4 grid gap-3 xl:grid-cols-3">
          <DashboardChartCard
            scope={`Periodo: ${toDateLabel(periodRange.dateFrom)} ate ${toDateLabel(periodRange.dateTo)} (${dashboardWindowDays} dias)`}
            section="Caixa"
            title="Fluxo corporativo"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={corporateFlowChart} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} domain={[0, yAxisWithHeadroom]} tickFormatter={toChartTick} />
                <Tooltip formatter={(value) => toMoney(Number(value) || 0)} />
                <Bar dataKey="total" fill="#0d5f80" radius={[8, 8, 0, 0]}>
                  <LabelList
                    dataKey="total"
                    fill="#07384D"
                    fontSize={12}
                    fontWeight={700}
                    formatter={toBarLabel}
                    position="top"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartCard>

          <DashboardChartCard
            footer={
              <DashboardLegend
                colors={CHART_COLORS}
                getValue={(item) => item.value}
                items={visibleInvoiceStatusChart.length ? visibleInvoiceStatusChart : invoiceStatusChart}
              />
            }
            scope={dashboardScopeLabel(dashboardWindowDays)}
            section="Faturas"
            title="Faturas por status"
          >
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={invoiceStatusChart}
                  dataKey="value"
                  innerRadius={62}
                  label={pieValueLabel}
                  labelLine={false}
                  nameKey="name"
                  outerRadius={95}
                >
                  {invoiceStatusChart.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </DashboardChartCard>

          <DashboardChartCard
            scope={dashboardScopeLabel(dashboardWindowDays)}
            section="Despesas"
            title="Despesas por tipo"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={expenseByTypeChart} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} domain={[0, yAxisWithHeadroom]} tickFormatter={toChartTick} />
                <Tooltip formatter={(value) => toMoney(Number(value) || 0)} />
                <Bar dataKey="total" fill="#14b8a6" radius={[8, 8, 0, 0]}>
                  <LabelList
                    dataKey="total"
                    fill="#07384D"
                    fontSize={12}
                    fontWeight={700}
                    formatter={toBarLabel}
                    position="top"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartCard>
        </section>

        <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <DashboardMetricTile
            accent={corporateResult.operatingResult >= 0 ? "emerald" : "rose"}
            label="Resultado operacional"
            note="recebido menos despesas aprovadas"
            value={toMoney(corporateResult.operatingResult)}
            valueClassName="text-[clamp(1.1rem,1.3vw,1.8rem)]"
          />
          <DashboardMetricTile
            accent={corporateResult.operatingMargin >= 0 ? "brand" : "rose"}
            label="Margem operacional"
            note="base no recebido do periodo"
            value={`${corporateResult.operatingMargin.toFixed(1)}%`}
          />
          <DashboardMetricTile
            label="Carteira total a receber"
            note="inclui emitidas, parciais e vencidas"
            value={toMoney(receivablesPortfolioSummary.total)}
            valueClassName="text-[clamp(1.1rem,1.3vw,1.8rem)]"
          />
          <DashboardMetricTile
            accent="rose"
            label="Inadimplencia da carteira"
            note="percentual em atraso"
            value={`${receivablesPortfolioSummary.overdueRate.toFixed(1)}%`}
          />
          <DashboardMetricTile
            label="Despesas aprovadas"
            note={`ultimos ${dashboardWindowDays} dias`}
            value={toMoney(approvedExpenseTotal)}
            valueClassName="text-[clamp(1.1rem,1.3vw,1.8rem)]"
          />
          <DashboardMetricTile
            accent="amber"
            label="Compromissos pendentes"
            note="despesas submetidas aguardando aprovacao"
            value={toMoney(submittedExpenseTotal)}
            valueClassName="text-[clamp(1.1rem,1.3vw,1.8rem)]"
          />
        </section>

        <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DashboardMetricTile
            label="Recebimentos previstos"
            note="proximos 90 dias"
            value={toMoney(forecastTotals.receipts)}
            valueClassName="text-[clamp(1.1rem,1.3vw,1.8rem)]"
          />
          <DashboardMetricTile
            accent="rose"
            label="Despesas previstas"
            note="media recente aprovada"
            value={toMoney(forecastTotals.expenses)}
            valueClassName="text-[clamp(1.1rem,1.3vw,1.8rem)]"
          />
          <DashboardMetricTile
            accent={forecastTotals.result >= 0 ? "emerald" : "rose"}
            label="Resultado previsto"
            note="previsao de caixa 90 dias"
            value={toMoney(forecastTotals.result)}
            valueClassName="text-[clamp(1.1rem,1.3vw,1.8rem)]"
          />
          <article className="app-surface card overflow-hidden p-4">
            <div className="mb-4 h-1.5 w-14 rounded-full bg-brand-background/60" />
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Meta mensal de receita</p>
            <Input
              className="mt-3"
              inputMode="decimal"
              onChange={(event) => setMonthlyRevenueTargetInput(event.target.value)}
              placeholder="Ex: 50000"
              value={monthlyRevenueTargetInput}
            />
            <p className="mt-3 text-xs text-slate-500">Usada no grafico de meta x realizado dos ultimos 6 meses.</p>
          </article>
          <article className="app-surface card overflow-hidden p-4">
            <div className="mb-4 h-1.5 w-14 rounded-full bg-brand-background/60" />
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Teto mensal de despesa</p>
            <Input
              className="mt-3"
              inputMode="decimal"
              onChange={(event) => setMonthlyExpenseTargetInput(event.target.value)}
              placeholder="Ex: 25000"
              value={monthlyExpenseTargetInput}
            />
            <p className="mt-3 text-xs text-slate-500">Meta de resultado igual a receita meta menos teto de despesa.</p>
          </article>
        </section>

        <section className="mb-4 grid gap-3 xl:grid-cols-3">
          <DashboardChartCard
            scope="Escopo proprio: proximos 90 dias"
            section="Forecast"
            title="Previsao de caixa"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={forecastCashFlowChart} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} domain={[0, yAxisWithHeadroom]} tickFormatter={toChartTick} />
                <Tooltip formatter={(value) => toMoney(Number(value) || 0)} />
                <Bar dataKey="recebimentosPrevistos" fill="#14b8a6" name="Recebimentos previstos" radius={[8, 8, 0, 0]}>
                  <LabelList
                    dataKey="recebimentosPrevistos"
                    fill="#07384D"
                    fontSize={11}
                    fontWeight={700}
                    formatter={toBarLabel}
                    position="top"
                  />
                </Bar>
                <Bar dataKey="despesasPrevistas" fill="#ef4444" name="Despesas previstas" radius={[8, 8, 0, 0]}>
                  <LabelList
                    dataKey="despesasPrevistas"
                    fill="#991B1B"
                    fontSize={11}
                    fontWeight={700}
                    formatter={toBarLabel}
                    position="top"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartCard>

          <DashboardChartCard
            scope="Escopo proprio: ultimos 6 meses"
            section="Meta"
            title="Meta x realizado de receita"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={monthlyGoalsRevenueChart} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} domain={[0, yAxisWithHeadroom]} tickFormatter={toChartTick} />
                <Tooltip formatter={(value) => toMoney(Number(value) || 0)} />
                <Bar dataKey="realizado" fill="#0d5f80" name="Realizado" radius={[8, 8, 0, 0]}>
                  <LabelList
                    dataKey="realizado"
                    fill="#07384D"
                    fontSize={11}
                    fontWeight={700}
                    formatter={toBarLabel}
                    position="top"
                  />
                </Bar>
                <Bar dataKey="meta" fill="#f59e0b" name="Meta" radius={[8, 8, 0, 0]}>
                  <LabelList
                    dataKey="meta"
                    fill="#07384D"
                    fontSize={11}
                    fontWeight={700}
                    formatter={toBarLabel}
                    position="top"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartCard>

          <DashboardChartCard
            scope="Escopo proprio: ultimos 6 meses"
            section="Meta"
            title="Meta x realizado de resultado"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={monthlyGoalsResultChart} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis
                  allowDecimals={false}
                  domain={[
                    (dataMin: number) => yAxisWithSignedHeadroomMin(dataMin),
                    (dataMax: number) => yAxisWithHeadroom(dataMax)
                  ]}
                  tickFormatter={toChartTick}
                />
                <Tooltip formatter={(value) => toMoney(Number(value) || 0)} />
                <Bar dataKey="realizado" fill="#22c55e" name="Resultado realizado" radius={[8, 8, 0, 0]}>
                  <LabelList
                    dataKey="realizado"
                    fill="#07384D"
                    fontSize={11}
                    fontWeight={700}
                    formatter={toBarLabel}
                    position="top"
                  />
                </Bar>
                <Bar dataKey="meta" fill="#6366f1" name="Meta de resultado" radius={[8, 8, 0, 0]}>
                  <LabelList
                    dataKey="meta"
                    fill="#07384D"
                    fontSize={11}
                    fontWeight={700}
                    formatter={toBarLabel}
                    position="top"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartCard>
        </section>

        <section className="mb-4 grid gap-3 xl:grid-cols-3">
          <DashboardChartCard
            footer={
              <DashboardLegend
                colors={CHART_COLORS}
                getValue={(item) => toMoney(item.value)}
                items={visibleReceivablesPieChart.length ? visibleReceivablesPieChart : receivablesPieChart}
              />
            }
            scope="Classificacao atual da carteira aberta"
            section="Recebiveis"
            title="Carteira de recebiveis"
          >
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={receivablesPieChart}
                  dataKey="value"
                  innerRadius={62}
                  label={pieValueLabel}
                  labelLine={false}
                  nameKey="name"
                  outerRadius={95}
                >
                  {receivablesPieChart.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => toMoney(Number(value) || 0)} />
              </PieChart>
            </ResponsiveContainer>
          </DashboardChartCard>

          <DashboardChartCard
            scope="Envelhecimento por faixa de vencimento"
            section="Recebiveis"
            title="Aging de recebiveis"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={agingReceivablesChart} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="faixa" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} domain={[0, yAxisWithHeadroom]} tickFormatter={toChartTick} />
                <Tooltip formatter={(value) => toMoney(Number(value) || 0)} />
                <Bar dataKey="total" fill="#0d5f80" radius={[8, 8, 0, 0]}>
                  <LabelList
                    dataKey="total"
                    fill="#07384D"
                    fontSize={12}
                    fontWeight={700}
                    formatter={toBarLabel}
                    position="top"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardChartCard>

          <article className="app-surface card p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.08em] text-brand-primary">Saude financeira</p>
                <p className="mt-1 text-xs text-slate-500">Leitura executiva para diretoria e cobranca</p>
              </div>
              <span className="rounded-full bg-brand-background-soft px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-brand-primary">
                Saude
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="rounded-[20px] border border-brand-primary/10 bg-white/80 p-3">
                <p className="text-xs uppercase text-slate-500">Recebimento no periodo</p>
                <p className="text-lg font-black text-emerald-700">{toMoney(corporateResult.received)}</p>
              </div>
              <div className="rounded-[20px] border border-brand-primary/10 bg-white/80 p-3">
                <p className="text-xs uppercase text-slate-500">Valor em atraso da carteira</p>
                <p className="text-lg font-black text-rose-700">{toMoney(receivablesPortfolioSummary.overdue)}</p>
              </div>
              <div className="rounded-[20px] border border-brand-primary/10 bg-white/80 p-3">
                <p className="text-xs uppercase text-slate-500">Valor em acordo</p>
                <p className="text-lg font-black text-amber-700">{toMoney(receivablesPortfolioSummary.agreement)}</p>
              </div>
              <div className="rounded-[20px] border border-brand-primary/10 bg-white/80 p-3">
                <p className="text-xs uppercase text-slate-500">Valor em dia</p>
                <p className="text-lg font-black text-brand-primary">{toMoney(receivablesPortfolioSummary.current)}</p>
              </div>
            </div>
          </article>
        </section>

        <section className="app-surface card mb-4 p-4">
          <h2 className="text-sm font-bold uppercase text-brand-primary">Operacional de faturamento e cobranca</h2>
          <p className="mt-1 text-sm text-slate-600">
            Bloco abaixo focado em emissao de faturas, cobranca, pagamentos e relacionamento com clientes inadimplentes.
          </p>
        </section>

        <section className="mb-4 grid gap-3 md:grid-cols-4">
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Faturas (consolidado)</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{summary?.totalInvoices ?? 0}</p>
          </article>
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">A receber (consolidado)</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{toMoney(summary?.amounts.open ?? 0)}</p>
          </article>
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Recebido (consolidado)</p>
            <p className="mt-2 text-2xl font-black text-emerald-700">{toMoney(summary?.amounts.received ?? 0)}</p>
          </article>
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Vencidas (consolidado)</p>
            <p className="mt-2 text-2xl font-black text-rose-700">{summary?.overdue ?? 0}</p>
          </article>
        </section>

        <section className="mb-4 grid gap-3 md:grid-cols-2">
          <article className="app-surface rounded-[24px] border border-rose-200 bg-rose-50/90 p-4 shadow-[0_18px_40px_rgba(225,29,72,0.08)]">
            <div className="mb-2 flex items-center gap-2 text-rose-800">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm font-black uppercase tracking-wide">Clientes inadimplentes</p>
            </div>
            <p className="text-2xl font-black text-rose-700">{customerRisk.overdue.length}</p>
            <p className="text-xs font-semibold text-rose-700">
              Saldo total: {toMoney(customerRisk.overdue.reduce((acc, item) => acc + item.balance, 0))}
            </p>
            <div className="mt-2 space-y-1">
              {customerRisk.overdue.slice(0, 4).map((item) => (
                <div className="rounded-2xl border border-rose-200 bg-white/80 px-3 py-2" key={item.customerId}>
                  <p className="text-sm font-semibold text-rose-900">{item.customerName}</p>
                  <p className="text-xs text-rose-700">
                    {item.invoices.join(", ")} - {toMoney(item.balance)}
                  </p>
                </div>
              ))}
              {!customerRisk.overdue.length ? (
                <p className="rounded-2xl border border-rose-200 bg-white/80 px-3 py-2 text-xs text-rose-700">
                  Nenhum cliente inadimplente no filtro atual.
                </p>
              ) : null}
            </div>
          </article>

          <article className="app-surface rounded-[24px] border border-amber-200 bg-amber-50/90 p-4 shadow-[0_18px_40px_rgba(245,158,11,0.08)]">
            <div className="mb-2 flex items-center gap-2 text-amber-900">
              <Handshake className="h-4 w-4" />
              <p className="text-sm font-black uppercase tracking-wide">Clientes em acordo</p>
            </div>
            <p className="text-2xl font-black text-amber-700">{customerRisk.agreement.length}</p>
            <p className="text-xs font-semibold text-amber-700">
              Saldo em acordo: {toMoney(customerRisk.agreement.reduce((acc, item) => acc + item.balance, 0))}
            </p>
            <div className="mt-2 space-y-1">
              {customerRisk.agreement.slice(0, 4).map((item) => (
                <div className="rounded-2xl border border-amber-200 bg-white/80 px-3 py-2" key={item.customerId}>
                  <p className="text-sm font-semibold text-amber-900">{item.customerName}</p>
                  <p className="text-xs text-amber-700">
                    {item.invoices.join(", ")} - {toMoney(item.balance)}
                  </p>
                </div>
              ))}
              {!customerRisk.agreement.length ? (
                <p className="rounded-2xl border border-amber-200 bg-white/80 px-3 py-2 text-xs text-amber-700">
                  Nenhum cliente em acordo no filtro atual.
                </p>
              ) : null}
            </div>
          </article>
        </section>

        <section className="app-surface card mb-4 p-4">
          <div className="grid gap-3 xl:grid-cols-4">
            <Input placeholder="Buscar por codigo/cliente" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select
              className="w-full rounded-2xl border border-brand-primary/15 bg-white/80 px-3 py-3"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as InvoiceStatus | "ALL")}
            >
              <option value="ALL">Todos os status</option>
              {(options?.statuses ?? []).map((status) => (
                <option key={status} value={status}>
                  {STATUS_META[status].label}
                </option>
              ))}
            </select>
            <select
              className="w-full rounded-2xl border border-brand-primary/15 bg-white/80 px-3 py-3"
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
            >
              <option value="">Todos os clientes</option>
              {(options?.customers ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-2xl border border-brand-primary/15 bg-white/80 px-3 py-3 text-sm font-medium text-slate-700">
              <input checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} type="checkbox" />
              Somente vencidas
            </label>
          </div>
        </section>

        {errorMsg ? <p className="mb-3 text-sm text-red-600">{errorMsg}</p> : null}

        <section className="space-y-3">
          {invoices.map((invoice) => (
            <article className="card p-4" key={invoice.id}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-brand-primary">{invoice.code}</p>
                  <p className="text-sm text-slate-700">{invoice.customer.name}</p>
                  <p className="text-xs text-slate-500">
                    Vencimento: {toDateTime(invoice.dueDate)} • Emissao: {toDateTime(invoice.issueDate)}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_META[invoice.status].className}`}>
                  {STATUS_META[invoice.status].label}
                </span>
              </div>

              <div className="mb-2 flex flex-wrap gap-2">
                {invoice.status === "OVERDUE" ? (
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                    Inadimplente
                  </span>
                ) : null}
                {invoice.charges.some((charge) => charge.status === "PROMISED") ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                    Em acordo
                  </span>
                ) : null}
              </div>

              {invoice.description ? <p className="mb-3 text-sm text-slate-700">{invoice.description}</p> : null}

              <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                <p>
                  <strong>Total:</strong> {toMoney(invoice.totalAmount)}
                </p>
                <p>
                  <strong>Pago:</strong> {toMoney(invoice.paidAmount)}
                </p>
                <p>
                  <strong>Saldo:</strong> {toMoney(invoice.balanceAmount)}
                </p>
                <p>
                  <strong>OS:</strong> {invoice.serviceOrder?.code ?? "-"}
                </p>
                <p>
                  <strong>Orcamento:</strong> {invoice.quote?.code ?? "-"}
                </p>
                <p>
                  <strong>Ticket:</strong> {invoice.deskTicket?.code ?? "-"}
                </p>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 p-3">
                <p className="mb-1 text-sm font-semibold text-brand-primary">Itens</p>
                <ul className="space-y-1 text-sm">
                  {invoice.items.map((item) => (
                    <li key={item.id}>
                      {item.description} - {item.quantity} x {toMoney(item.unitPrice)} = {toMoney(item.total)}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                <p>
                  Pagamentos:{" "}
                  {invoice.payments.length
                    ? invoice.payments.map((payment) => `${payment.method} ${toMoney(payment.amount)}`).join(" • ")
                    : "Nenhum"}
                </p>
                <p>
                  Cobrancas:{" "}
                  {invoice.charges.length
                    ? invoice.charges.map((charge) => `${charge.channel}/${charge.status}`).join(" • ")
                    : "Nenhuma"}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => issueInvoiceMutation.mutate(invoice.id)}
                  disabled={invoice.status === "PAID" || invoice.status === "CANCELED"}
                >
                  <ReceiptText className="mr-1 h-4 w-4" />
                  Emitir
                </Button>
                <Button
                  onClick={() => {
                    setPaymentInvoice(invoice);
                    setPaymentAmount(invoice.balanceAmount ? String(invoice.balanceAmount.toFixed(2)) : "");
                    setPaymentMethod("PIX");
                    setPaymentReference("");
                  }}
                  disabled={invoice.status === "PAID" || invoice.status === "CANCELED"}
                >
                  <Banknote className="mr-1 h-4 w-4" />
                  Registrar pagamento
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setChargeInvoice(invoice);
                    setChargeChannel("WHATSAPP");
                    setChargeNote("");
                  }}
                  disabled={invoice.status === "PAID" || invoice.status === "CANCELED" || invoice.status === "DRAFT"}
                >
                  <HandCoins className="mr-1 h-4 w-4" />
                  Cobrar
                </Button>
                <Button
                  variant="danger"
                  onClick={() => cancelInvoiceMutation.mutate(invoice.id)}
                  disabled={invoice.status === "PAID" || invoice.status === "CANCELED"}
                >
                  Cancelar
                </Button>
              </div>
            </article>
          ))}
          {!invoicesQuery.isLoading && invoices.length === 0 ? (
            <div className="card p-4 text-sm text-slate-600">Nenhuma fatura encontrada.</div>
          ) : null}
        </section>

        <Dialog open={Boolean(paymentInvoice)} onOpenChange={(value) => (!value ? setPaymentInvoice(null) : null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar pagamento</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                registerPaymentMutation.mutate();
              }}
            >
              <p className="text-sm text-slate-600">
                {paymentInvoice?.code} • Saldo {toMoney(paymentInvoice?.balanceAmount ?? 0)}
              </p>
              <Input value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Valor" />
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              >
                {(options?.paymentMethods ?? []).map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              <Input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder="Referencia (opcional)"
              />
              <Button className="w-full" type="submit" disabled={registerPaymentMutation.isPending}>
                {registerPaymentMutation.isPending ? "Salvando..." : "Confirmar pagamento"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(chargeInvoice)} onOpenChange={(value) => (!value ? setChargeInvoice(null) : null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disparar cobranca</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                createChargeMutation.mutate();
              }}
            >
              <p className="text-sm text-slate-600">
                {chargeInvoice?.code} • Saldo {toMoney(chargeInvoice?.balanceAmount ?? 0)}
              </p>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={chargeChannel}
                onChange={(event) => setChargeChannel(event.target.value as ChargeChannel)}
              >
                {(options?.chargeChannels ?? []).map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </select>
              <textarea
                className="w-full rounded-xl border px-3 py-2"
                rows={3}
                value={chargeNote}
                onChange={(event) => setChargeNote(event.target.value)}
                placeholder="Observacao da cobranca"
              />
              <Button className="w-full" type="submit" disabled={createChargeMutation.isPending}>
                {createChargeMutation.isPending ? "Enviando..." : "Registrar cobranca"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </AppShell>
    </RequireAuth>
  );
}
