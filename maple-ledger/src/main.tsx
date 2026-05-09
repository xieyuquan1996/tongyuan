import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout.js'
import Transactions from './pages/Transactions.js'
import MonthlyReport from './pages/MonthlyReport.js'
import ExchangeLoss from './pages/ExchangeLoss.js'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/transactions" replace />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/reports/monthly" element={<MonthlyReport />} />
          <Route path="/reports/exchange-loss" element={<ExchangeLoss />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
