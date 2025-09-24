import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import BackgroundProcessor from "@/components/BackgroundProcessor"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Research Co-pilot",
  description: "AI-powered research assistant for comprehensive analysis",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <BackgroundProcessor />
      </body>
    </html>
  )
}