import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import AddUserScreen from "./new";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

const mockMutate = jest.fn();
jest.mock("@/hooks/use-admin-users", () => ({
  useCreateUser: () => ({ mutate: mockMutate, isPending: false }),
}));

function renderScreen() {
  return render(
    <StaccatoThemeProvider>
      <AddUserScreen />
    </StaccatoThemeProvider>,
  );
}

describe("AddUserScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not submit until a username and 8+ char password are entered", () => {
    renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText("e.g. taylor"), "taylor");
    fireEvent.changeText(screen.getByPlaceholderText(/8 characters/), "short");
    fireEvent.press(screen.getByRole("button", { name: "Create User" }));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("submits the trimmed username and password", () => {
    renderScreen();
    fireEvent.changeText(
      screen.getByPlaceholderText("e.g. taylor"),
      "  taylor  ",
    );
    fireEvent.changeText(
      screen.getByPlaceholderText(/8 characters/),
      "supersecret",
    );
    fireEvent.press(screen.getByRole("button", { name: "Create User" }));
    expect(mockMutate).toHaveBeenCalledWith(
      { username: "taylor", password: "supersecret" },
      expect.any(Object),
    );
  });
});
