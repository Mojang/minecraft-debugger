// Define an interface
interface Person {
  name: string;
  age: number;
  greet(): string;
}

// Enum for employee roles
enum Role {
  Developer,
  Manager,
  Designer
}

// Generic function
function identity<T>(arg: T): T {
  return arg;
}

// Main class implementing the interface
class Employee implements Person {
  name: string;
  age: number;
  private position: string;
  role: Role;

  constructor(name: string, age: number, position: string, role: Role) {
      this.name = name;
      this.age = age;
      this.position = position;
      this.role = role;
  }

  greet(): string {
      return `Hello, my name is ${this.name} and I am ${this.age} years old.`;
  }

  getPosition(): string {
      return this.position;
  }

  getRole(): string {
      return Role[this.role];
  }
}

// Subclass extending the main class
class Manager extends Employee {
  private department: string;

  constructor(name: string, age: number, position: string, department: string) {
      super(name, age, position, Role.Manager);
      this.department = department;
  }

  getDepartment(): string {
      return this.department;
  }
}

// Class with static properties and methods
class Company {
  static companyName: string = "Tech Corp";
  static employees: Employee[] = [];

  static addEmployee(employee: Employee): void {
      this.employees.push(employee);
  }

  static getEmployeeCount(): number {
      return this.employees.length;
  }
}

// Class with getters and setters
class Project {
  private _name: string;
  private _duration: number; // in months

  constructor(name: string, duration: number) {
      this._name = name;
      this._duration = duration;
  }

  get name(): string {
      return this._name;
  }

  set name(newName: string) {
      this._name = newName;
  }

  get duration(): number {
      return this._duration;
  }

  set duration(newDuration: number) {
      this._duration = newDuration;
  }
}

// Example usage
const emp1 = new Employee("Alice", 30, "Developer", Role.Developer);
const emp2 = new Manager("Bob", 40, "Manager", "IT");

Company.addEmployee(emp1);
Company.addEmployee(emp2);

console.log(emp1.greet());
console.log(emp2.getDepartment());
console.log(`Total employees: ${Company.getEmployeeCount()}`);

const project = new Project("New Website", 6);
console.log(`Project: ${project.name}, Duration: ${project.duration} months`);
project.duration = 8;
console.log(`Updated Duration: ${project.duration} months`);

// Using the generic function
const output = identity<string>("Hello, TypeScript!");
console.log(output);

// Type assertion
let someValue: any = "this is a string";
let strLength: number = (someValue as string).length;
console.log(`String length: ${strLength}`);
