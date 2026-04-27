export type Priority = 'high' | 'medium' | 'low'

export interface Goal {
  description: string
  priority: Priority
}

export interface Personality {
  description: string
}

export interface Notes {
  [key: string]: string | undefined
}

export interface WeekAllocation {
  jobSearch: number
  applyKit: number
  groovebox: number
  bakuBook: number
  gym: number
  spanish: number
}

export interface WeekRecord {
  startDate: string
  allocations: WeekAllocation
}

export interface CoachData {
  profile: {
    name: string
    timezone: string
  }
  personality?: Personality
  goals: Record<string, Goal>
  currentWeek: WeekRecord
  history: WeekRecord[]
}

export interface WeeklyResponse {
  summary: string
  allocations: WeekAllocation
}

export interface JournalEntry {
  date: string
  type: 'chat' | 'weekly'
  entry: string
}
