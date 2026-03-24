import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

function getMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function getToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatMonthLabel(period: any): string {
  const parts = String(period).split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function ReportsPage() {
  const trpc = useTRPC();
  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(getToday);
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');

  const { data: categoryData, isLoading: categoryLoading } = useQuery(
    trpc.reports.spendingByCategory.queryOptions({ startDate, endDate }),
  );

  const { data: timeData, isLoading: timeLoading } = useQuery(
    trpc.reports.spendingOverTime.queryOptions({ startDate, endDate }),
  );

  const { data: netWorthData, isLoading: netWorthLoading } = useQuery(
    trpc.reports.netWorth.queryOptions({}),
  );

  const currencyFormatter = (value: number) => formatCurrency(value);
  // Recharts formatter types are overly strict; cast needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFormatter = ((value: unknown) => [formatCurrency(Number(value)), '']) as any;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 max-md:flex-col max-md:items-start max-md:gap-3">
        <h2 className="text-2xl font-bold">Reports</h2>
        <div className="flex items-center gap-3 max-md:flex-wrap max-md:w-full">
          <label className="text-sm text-gray-500">From</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded text-base max-md:flex-1"
          />
          <label className="text-sm text-gray-500">To</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded text-base max-md:flex-1"
          />
        </div>
      </div>

      {/* Spending by Category */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Spending by Category</h3>
          <button
            onClick={() => setChartType(chartType === 'pie' ? 'bar' : 'pie')}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Show as {chartType === 'pie' ? 'Bar' : 'Pie'}
          </button>
        </div>

        {categoryLoading ? (
          <p className="text-gray-500">Loading...</p>
        ) : !categoryData || categoryData.length === 0 ? (
          <p className="text-gray-500">No spending data for this period</p>
        ) : chartType === 'pie' ? (
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="total"
                  nameKey="categoryName"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={entry.categoryId} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={tooltipFormatter} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="categoryName" />
                <YAxis tickFormatter={currencyFormatter} />
                <Tooltip formatter={tooltipFormatter} />
                <Bar dataKey="total">
                  {categoryData.map((entry, index) => (
                    <Cell key={entry.categoryId} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Spending Over Time */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h3 className="text-lg font-semibold mb-4">Spending Over Time</h3>

        {timeLoading ? (
          <p className="text-gray-500">Loading...</p>
        ) : !timeData || timeData.length === 0 ? (
          <p className="text-gray-500">No spending data for this period</p>
        ) : (
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tickFormatter={formatMonthLabel} />
                <YAxis tickFormatter={currencyFormatter} />
                <Tooltip
                  formatter={tooltipFormatter}
                  labelFormatter={(label) => formatMonthLabel(String(label))}
                />
                <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Net Worth Trend */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-semibold mb-4">Net Worth Trend</h3>

        {netWorthLoading ? (
          <p className="text-gray-500">Loading...</p>
        ) : !netWorthData || netWorthData.length === 0 ? (
          <p className="text-gray-500">No balance snapshot data available</p>
        ) : (
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={netWorthData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={currencyFormatter} />
                <Tooltip formatter={tooltipFormatter} />
                <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
