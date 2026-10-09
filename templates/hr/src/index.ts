/** HR template: employees, departments, and leave requests. Pure metadata. */
export const hrTemplate = {
  moduleId: 'hr',
  name: 'HR',
  version: '1.0.0',
  description: 'Employees, departments, and leave requests',
  entities: [
    {
      id: 'department', name: 'department', label: 'Department', pluralLabel: 'Departments', description: 'Org units', settings: {},
      fields: [
        { id: 'name', name: 'name', label: 'Name', type: 'text', options: { required: true, unique: true, searchable: true }, position: 0 },
      ],
    },
    {
      id: 'employee', name: 'employee', label: 'Employee', pluralLabel: 'Employees', description: 'Staff records', settings: {},
      fields: [
        { id: 'employeeCode', name: 'employeeCode', label: 'Employee code', type: 'text', options: { required: true, unique: true }, position: 0 },
        { id: 'fullName', name: 'fullName', label: 'Full name', type: 'text', options: { required: true, searchable: true }, position: 1 },
        { id: 'workEmail', name: 'workEmail', label: 'Work email', type: 'email', options: { unique: true }, position: 2 },
        { id: 'hiredAt', name: 'hiredAt', label: 'Hired at', type: 'date', options: {}, position: 3 },
      ],
    },
    {
      id: 'leaveRequest', name: 'leaveRequest', label: 'Leave request', pluralLabel: 'Leave requests', description: 'Time-off requests', settings: {},
      fields: [
        { id: 'startDate', name: 'startDate', label: 'Start date', type: 'date', options: { required: true }, position: 0 },
        { id: 'endDate', name: 'endDate', label: 'End date', type: 'date', options: { required: true }, position: 1 },
        { id: 'status', name: 'status', label: 'Status', type: 'select', options: { choices: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }] }, position: 2 },
      ],
    },
  ],
  relations: [
    { id: 'department-employee', name: 'department-employee', sourceEntityId: 'department', targetEntityId: 'employee', type: 'manyToOne' },
    { id: 'employee-leave', name: 'employee-leave', sourceEntityId: 'employee', targetEntityId: 'leaveRequest', type: 'manyToOne' },
  ],
} as const;
